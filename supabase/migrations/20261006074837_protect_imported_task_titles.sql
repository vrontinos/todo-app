-- Store provenance on the task so clearing import history cannot unlock its title.
ALTER TABLE public.tasks
  ADD COLUMN imported_title_locked boolean NOT NULL DEFAULT false;

CREATE TABLE public.imported_task_title_editors (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE public.imported_task_title_editors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.imported_task_title_editors FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.imported_task_title_editors TO authenticated, service_role;
CREATE POLICY imported_task_title_editors_read_self
  ON public.imported_task_title_editors FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Resolve the existing account; never trust a client-supplied email or updated_by.
DO $block$
BEGIN
  IF (SELECT count(*) FROM auth.users WHERE email = 'eshop@vrontinos.gr') <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one eshop title editor';
  END IF;
  INSERT INTO public.imported_task_title_editors (user_id)
    SELECT id FROM auth.users WHERE email = 'eshop@vrontinos.gr';
END;
$block$;

CREATE INDEX IF NOT EXISTS skroutz_imported_items_task_id_idx
  ON public.skroutz_imported_items (task_id);

UPDATE public.tasks AS t SET imported_title_locked = true
WHERE EXISTS (SELECT 1 FROM public.softone_imported_items AS i WHERE i.task_id = t.id)
   OR EXISTS (SELECT 1 FROM public.skroutz_imported_items AS i WHERE i.task_id = t.id);

CREATE FUNCTION public.protect_imported_task_title()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $function$
BEGIN
  -- Trusted server maintenance retains access; signed-in users are checked by uid.
  IF auth.uid() IS NULL AND current_user IN ('postgres', 'supabase_admin', 'service_role') THEN
    RETURN NEW;
  END IF;

  IF OLD.imported_title_locked AND NOT NEW.imported_title_locked THEN
    RAISE EXCEPTION 'Imported task provenance cannot be cleared' USING ERRCODE = '42501';
  END IF;

  IF NEW.title IS DISTINCT FROM OLD.title AND (
    OLD.imported_title_locked
    OR EXISTS (SELECT 1 FROM public.softone_imported_items AS i WHERE i.task_id = OLD.id)
    OR EXISTS (SELECT 1 FROM public.skroutz_imported_items AS i WHERE i.task_id = OLD.id)
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.imported_task_title_editors AS e WHERE e.user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'Μόνο ο χρήστης eshop μπορεί να αλλάξει τον τίτλο εισαγόμενης εργασίας.'
        USING ERRCODE = '42501';
    END IF;
    NEW.imported_title_locked := true;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.protect_imported_task_title() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.protect_imported_task_title() TO authenticated, service_role;
CREATE TRIGGER trg_protect_imported_task_title
  BEFORE UPDATE ON public.tasks FOR EACH ROW
  EXECUTE FUNCTION public.protect_imported_task_title();

CREATE FUNCTION public.mark_imported_task_title_locked()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $function$
BEGIN
  UPDATE public.tasks SET imported_title_locked = true
    WHERE id = NEW.task_id AND NOT imported_title_locked;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.mark_imported_task_title_locked() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_imported_task_title_locked() TO authenticated, service_role;
CREATE TRIGGER trg_softone_lock_imported_task_title
  AFTER INSERT OR UPDATE OF task_id ON public.softone_imported_items
  FOR EACH ROW WHEN (NEW.task_id IS NOT NULL)
  EXECUTE FUNCTION public.mark_imported_task_title_locked();
CREATE TRIGGER trg_skroutz_lock_imported_task_title
  AFTER INSERT OR UPDATE OF task_id ON public.skroutz_imported_items
  FOR EACH ROW WHEN (NEW.task_id IS NOT NULL)
  EXECUTE FUNCTION public.mark_imported_task_title_locked();
