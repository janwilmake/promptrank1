import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;

const DEFAULT_EMAIL = "jan@wilmake.com";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function loadEnvFile(filename) {
  const fullPath = path.join(repoRoot, filename);
  if (!fs.existsSync(fullPath)) return;

  const contents = fs.readFileSync(fullPath, "utf8");
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) continue;

    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function quotedIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function qualifiedTable({ table_schema: schema, table_name: table }) {
  return `${quotedIdentifier(schema)}.${quotedIdentifier(table)}`;
}

async function findTablesByNames(client, tableNames, requiredColumns) {
  const result = await client.query(
    `
      select table_schema, table_name
      from information_schema.tables
      where table_type = 'BASE TABLE'
        and table_name = any($1::text[])
      order by
        case table_schema
          when 'public' then 0
          when 'auth' then 1
          else 2
        end,
        table_name
    `,
    [tableNames]
  );

  const matches = [];
  for (const row of result.rows) {
    const columnResult = await client.query(
      `
        select column_name
        from information_schema.columns
        where table_schema = $1
          and table_name = $2
      `,
      [row.table_schema, row.table_name]
    );

    const columns = new Set(columnResult.rows.map((item) => item.column_name));
    if (requiredColumns.every((column) => columns.has(column))) {
      matches.push({ ...row, columns });
    }
  }

  return matches;
}

async function findTablesWithColumn(client, columnName) {
  const result = await client.query(
    `
      select table_schema, table_name
      from (
        select distinct table_schema, table_name
        from information_schema.columns
        where column_name = $1
      ) tables
      order by
        case table_schema
          when 'public' then 0
          when 'auth' then 1
          else 2
        end,
        table_name
    `,
    [columnName]
  );

  const matches = [];
  for (const row of result.rows) {
    const columnResult = await client.query(
      `
        select column_name
        from information_schema.columns
        where table_schema = $1
          and table_name = $2
      `,
      [row.table_schema, row.table_name]
    );

    matches.push({
      ...row,
      columns: new Set(columnResult.rows.map((item) => item.column_name)),
    });
  }

  return matches;
}

async function deleteRows(client, table, predicateSql, values) {
  const result = await client.query(
    `delete from ${qualifiedTable(table)} where ${predicateSql}`
      + " returning 1"
  , values);

  return result.rowCount ?? 0;
}

async function main() {
  loadEnvFile(".env.local");
  loadEnvFile(".env");

  const email = process.argv[2] ?? DEFAULT_EMAIL;
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required. Add it to .env.local or the shell env.");
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  const client = await pool.connect();

  try {
    await client.query("begin");

    const emailTables = await findTablesWithColumn(client, "email");
    const matchedUsers = [];
    const emailMatchedTables = [];

    for (const table of emailTables) {
      try {
        const idColumn = table.columns.has("id")
          ? "id"
          : table.columns.has("user_id")
            ? "user_id"
            : table.columns.has("userId")
              ? "userId"
              : null;

        const selectedId = idColumn ? `${quotedIdentifier(idColumn)}::text as matched_id,` : "null::text as matched_id,";
        const userResult = await client.query(
          `select ${selectedId} lower(email) as email
           from ${qualifiedTable(table)}
           where lower(email) = lower($1)`,
          [email]
        );

        if (userResult.rowCount > 0) {
          emailMatchedTables.push(table);
          for (const row of userResult.rows) {
            if (row.matched_id) {
              matchedUsers.push({ id: row.matched_id, email: row.email });
            }
          }
        }
      } catch (_error) {
        // Ignore tables that are not accessible via the current connection.
      }
    }

    const users = Array.from(
      new Map(matchedUsers.map((user) => [user.id, user])).values()
    );
    const userIds = users.map((user) => user.id);
    const deleted = {
      authUsers: 0,
      authEmailRows: 0,
      accounts: 0,
      sessions: 0,
      verificationRows: 0,
      subscriptions: 0,
      sites: 0,
      prompts: 0,
      promptResults: 0,
    };

    let siteIds = [];
    if (userIds.length > 0) {
      const siteIdsResult = await client.query(
        "select id from public.sites where user_id = any($1::text[])",
        [userIds]
      );
      siteIds = siteIdsResult.rows.map((row) => row.id);
    }

    if (siteIds.length > 0) {
      const promptIdsResult = await client.query(
        "select id from public.prompts where site_id = any($1::uuid[])",
        [siteIds]
      );
      const promptIds = promptIdsResult.rows.map((row) => row.id);

      deleted.prompts = promptIds.length;

      if (promptIds.length > 0) {
        const promptResultsDelete = await client.query(
          "delete from public.prompt_results where prompt_id = any($1::uuid[]) returning 1",
          [promptIds]
        );
        deleted.promptResults = promptResultsDelete.rowCount ?? 0;
      }
    }

    if (userIds.length > 0) {
      deleted.subscriptions =
        (await client.query("delete from public.subscriptions where user_id = any($1::text[]) returning 1", [userIds]))
          .rowCount ?? 0;

      deleted.sites =
        (await client.query("delete from public.sites where user_id = any($1::text[]) returning 1", [userIds]))
          .rowCount ?? 0;
    }

    const accountTables = await findTablesByNames(client, ["account", "accounts"], ["id"]);
    for (const accountTable of accountTables) {
      const userColumn = accountTable.columns.has("userId")
        ? "userId"
        : accountTable.columns.has("user_id")
          ? "user_id"
          : null;

      if (userColumn && userIds.length > 0) {
        deleted.accounts += await deleteRows(
          client,
          accountTable,
          `${quotedIdentifier(userColumn)}::text = any($1::text[])`,
          [userIds]
        );
      }
    }

    const sessionTables = await findTablesByNames(client, ["session", "sessions"], ["id"]);
    for (const sessionTable of sessionTables) {
      const userColumn = sessionTable.columns.has("userId")
        ? "userId"
        : sessionTable.columns.has("user_id")
          ? "user_id"
          : null;

      if (userColumn) {
        deleted.sessions += await deleteRows(
          client,
          sessionTable,
          `${quotedIdentifier(userColumn)}::text = any($1::text[])`,
          [userIds]
        );
      }
    }

    const verificationTables = await findTablesByNames(
      client,
      ["verification", "verifications"],
      ["id"]
    );
    for (const verificationTable of verificationTables) {
      if (verificationTable.columns.has("email")) {
        deleted.verificationRows += await deleteRows(
          client,
          verificationTable,
          "lower(email) = lower($1)",
          [email]
        );
      }
    }

    for (const table of emailMatchedTables) {
      if (!table.columns.has("email")) continue;
      if (!table.columns.has("id") && !table.columns.has("user_id") && !table.columns.has("userId")) continue;

      const deletedCount = await deleteRows(
        client,
        table,
        "lower(email) = lower($1)",
        [email]
      );

      if (table.table_schema === "auth" && table.table_name === "users") {
        deleted.authUsers += deletedCount;
      } else {
        deleted.authEmailRows += deletedCount;
      }
    }

    await client.query("commit");

    console.log(`Reset onboarding state for ${email}.`);
    console.log(`Matched user ids: ${userIds.length > 0 ? userIds.join(", ") : "(none found)"}`);
    console.log(JSON.stringify(deleted, null, 2));
    console.log("App data and matching auth rows were removed where discoverable.");
  } catch (error) {
    await client.query("rollback");
    console.error("Failed to reset onboarding state.");
    console.error(error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

await main();
