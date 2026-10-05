-- Reuse the existing guarded quantity-change trigger.
-- Delete only notes belonging to its active task; keep the Import's title marker.
CREATE OR REPLACE FUNCTION public.clear_stock_on_softone_quantity_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  UPDATE public.tasks
  SET stock_status = 'none',
      stock_quantity = NULL
  WHERE id = NEW.task_id
    AND deleted_at IS NULL
    AND stock_status IN ('zero', 'limited');

  DELETE FROM public.task_notes AS n
  USING public.tasks AS t
  WHERE n.task_id = NEW.task_id
    AND t.id = n.task_id
    AND t.deleted_at IS NULL;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.clear_stock_on_softone_quantity_change() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_stock_on_softone_quantity_change() TO authenticated;
