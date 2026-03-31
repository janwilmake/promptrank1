alter table prompt_results
  add column competitor_domains text[] not null default '{}';
