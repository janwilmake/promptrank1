type LogFields = Record<string, unknown>;

function serializeError(error: Error) {
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
}

function normalizeFields(fields: LogFields) {
  return Object.fromEntries(
    Object.entries(fields).flatMap(([key, value]) => {
      if (value === undefined) return [];
      if (value instanceof Error) return [[key, serializeError(value)]];
      return [[key, value]];
    })
  );
}

export function logInfo(scope: string, message: string, fields: LogFields = {}) {
  console.info(`[${scope}] ${message}`, normalizeFields(fields));
}

export function logError(scope: string, message: string, fields: LogFields = {}) {
  console.error(`[${scope}] ${message}`, normalizeFields(fields));
}
