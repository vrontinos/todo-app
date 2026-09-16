create or replace function public.reorder_tasks_atomic(
  p_list_id bigint,
  p_task_ids bigint[]
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_expected_count bigint;
  v_input_count bigint;
  v_distinct_count bigint;
  v_matched_count bigint;
  v_updated_count bigint;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_list_id is null or p_task_ids is null then
    raise exception 'Invalid reorder payload' using errcode = '22004';
  end if;

  if not exists (
    select 1
    from public.lists l
    where l.id = p_list_id
      and (
        l.owner_user_id = v_user_id
        or exists (
          select 1
          from public.list_members lm
          where lm.list_id = l.id
            and lm.user_id = v_user_id
            and lm.role in ('owner', 'editor')
        )
      )
  ) then
    raise exception 'Not allowed to reorder tasks for this list' using errcode = '42501';
  end if;

  select count(*)
  into v_expected_count
  from public.tasks t
  where t.list_id = p_list_id;

  select count(*), count(distinct u.task_id)
  into v_input_count, v_distinct_count
  from unnest(p_task_ids) as u(task_id);

  if v_input_count <> v_distinct_count then
    raise exception 'Task reorder payload contains duplicate ids' using errcode = '22023';
  end if;

  if v_input_count <> v_expected_count then
    raise exception 'Task set changed; refresh before reordering' using errcode = '22023';
  end if;

  select count(*)
  into v_matched_count
  from public.tasks t
  where t.list_id = p_list_id
    and t.id = any(p_task_ids);

  if v_matched_count <> v_expected_count then
    raise exception 'Task reorder payload does not match list contents' using errcode = '22023';
  end if;

  with desired as (
    select
      u.task_id,
      u.ordinality::integer as new_position
    from unnest(p_task_ids) with ordinality as u(task_id, ordinality)
  )
  update public.tasks t
  set
    position = desired.new_position,
    updated_by = v_user_id
  from desired
  where t.id = desired.task_id
    and t.list_id = p_list_id;

  get diagnostics v_updated_count = row_count;

  if v_updated_count <> v_expected_count then
    raise exception 'Task set changed during reorder' using errcode = '40001';
  end if;
end;
$$;

comment on function public.reorder_tasks_atomic(bigint, bigint[])
is 'Atomically rewrites one editable list task order to contiguous 1..N positions.';

revoke all on function public.reorder_tasks_atomic(bigint, bigint[]) from public;
grant execute on function public.reorder_tasks_atomic(bigint, bigint[]) to authenticated;
