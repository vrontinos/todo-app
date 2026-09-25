create or replace function public.delete_tasks_atomic(p_task_ids bigint[])
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_requested_count bigint;
  v_distinct_count bigint;
  v_deleted_count bigint;
begin
  if p_task_ids is null or cardinality(p_task_ids) = 0 then
    raise exception 'p_task_ids must contain at least one task id'
      using errcode = '22023';
  end if;

  if array_position(p_task_ids, null) is not null then
    raise exception 'p_task_ids must not contain null values'
      using errcode = '22023';
  end if;

  v_requested_count := cardinality(p_task_ids);

  select count(distinct requested.id)::bigint
    into v_distinct_count
  from unnest(p_task_ids) as requested(id);

  if v_distinct_count <> v_requested_count then
    raise exception 'p_task_ids must not contain duplicate values'
      using errcode = '22023';
  end if;

  delete from public.tasks as task
  where task.id = any (p_task_ids);

  get diagnostics v_deleted_count = row_count;

  if v_deleted_count <> v_requested_count then
    raise exception 'bulk task delete rejected: requested %, deleted %',
      v_requested_count,
      v_deleted_count
      using errcode = '42501';
  end if;

  return v_deleted_count;
end;
$$;

revoke all on function public.delete_tasks_atomic(bigint[]) from public;
revoke execute on function public.delete_tasks_atomic(bigint[]) from anon;
grant execute on function public.delete_tasks_atomic(bigint[]) to authenticated;
