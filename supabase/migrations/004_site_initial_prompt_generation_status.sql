alter table sites
  add column initial_prompt_generation_status text not null default 'not_started';

