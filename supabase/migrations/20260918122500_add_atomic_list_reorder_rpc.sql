create or replace function public.reorder_lists_atomic(
  p_list_ids bigint[]
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
  v_final_count bigint;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_list_ids is null then
    raise exception 'Invalid reorder payload' using errcode = '22004';
  end if;

  perform 1
  from public.lists l
  where l.owner_user_id = v_user_id
  for update;

  select count(*)
  into v_expected_count
  from public.lists l
  where l.owner_user_id = v_user_id;

  select count(*), count(distinct u.list_id)
  into v_input_count, v_distinct_count
  from unnest(p_list_ids) as u(list_id);

  if v_input_count <> v_distinct_count then
    raise exception 'List reorder payload contains duplicate ids' using errcode = '22023';
  end if;

  if v_input_count <> v_expected_count then
    raise exception 'List set changed; refresh before reordering' using errcode = '22023';
  end if;

  select count(*)
  into v_matched_count
  from public.lists l
  where l.owner_user_id = v_user_id
    and l.id = any(p_list_ids);

  if v_matched_count <> v_expected_count then
    raise exception 'List reorder payload does not match owned list contents' using errcode = '22023';
  end if;

  with desired as (
    select
      u.list_id,
      u.ordinality::integer as new_position
    from unnest(p_list_ids) with ordinality as u(list_id, ordinality)
  )
  update public.lists l
  set position = desired.new_position
  from desired
  where l.id = desired.list_id
    and l.owner_user_id = v_user_id;

  get diagnostics v_updated_count = row_count;

  if v_updated_count <> v_expected_count then
    raise exception 'List set changed during reorder' using errcode = '40001';
  end if;

  select count(*)
  into v_final_count
  from public.lists l
  where l.owner_user_id = v_user_id;

  if v_final_count <> v_expected_count then
    raise exception 'List set changed during reorder' using errcode = '40001';
  end if;
end;
$$;

comment on function public.reorder_lists_atomic(bigint[])
is 'Atomically rewrites the authenticated owner complete list order to contiguous 1..N positions.';

revoke all on function public.reorder_lists_atomic(bigint[]) from public;
revoke execute on function public.reorder_lists_atomic(bigint[]) from anon;
grant execute on function public.reorder_lists_atomic(bigint[]) to authenticated;
