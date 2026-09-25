create or replace function public.get_task_note_counts()
returns table (
  task_id bigint,
  note_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    tn.task_id,
    count(*)::bigint as note_count
  from public.task_notes as tn
  group by tn.task_id;
$$;

revoke all on function public.get_task_note_counts() from public;
revoke execute on function public.get_task_note_counts() from anon;
grant execute on function public.get_task_note_counts() to authenticated;
