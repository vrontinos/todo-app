-- A changed imported order quantity invalidates the task's stock assessment.
-- Keep this in the database so existing Import installations receive the behavior.
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
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.clear_stock_on_softone_quantity_change() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_stock_on_softone_quantity_change() TO authenticated;

DROP TRIGGER IF EXISTS trg_clear_stock_on_softone_quantity_change
ON public.softone_imported_items;

CREATE TRIGGER trg_clear_stock_on_softone_quantity_change
AFTER UPDATE OF quantity ON public.softone_imported_items
FOR EACH ROW
WHEN (
  OLD.task_id IS NOT DISTINCT FROM NEW.task_id
  AND NEW.task_id IS NOT NULL
  AND OLD.quantity IS NOT NULL
  AND NEW.quantity IS NOT NULL
  AND OLD.quantity IS DISTINCT FROM NEW.quantity
)
EXECUTE FUNCTION public.clear_stock_on_softone_quantity_change();
