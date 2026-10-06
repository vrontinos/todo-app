BEGIN;
SELECT set_config('test.owner',u.id::text,true),set_config('test.editor',lm.user_id::text,true),set_config('test.list',lm.list_id::text,true)
FROM auth.users u JOIN lists l ON l.owner_user_id=u.id JOIN list_members lm ON lm.list_id=l.id
WHERE u.email='eshop@vrontinos.gr' AND lm.role='editor' AND lm.user_id<>u.id LIMIT 1;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.owner'),'role','authenticated')::text,true);
SET LOCAL ROLE authenticated;
INSERT INTO tasks(id,list_id,title,created_by) OVERRIDING SYSTEM VALUE
SELECT n,current_setting('test.list')::bigint,'Title permission regression fixture',current_setting('test.owner')::uuid
FROM unnest(ARRAY[-980001,-980002,-980003,-980004,-980005]::bigint[]) n;
INSERT INTO softone_imported_items(order_code,order_uid,product_name_clean,quantity,task_id,imported_by)
VALUES ('__title_lock_test__','__title_lock_test__','softone fixture',2,-980002,current_setting('test.owner')::uuid),
('__title_lock_test_cleanup__','__title_lock_test_cleanup__','cleanup fixture',1,-980004,current_setting('test.owner')::uuid);
INSERT INTO skroutz_imported_items(id,order_code,product_name_clean,task_id,created_by) OVERRIDING SYSTEM VALUE
VALUES(-980003,'__title_lock_test__','skroutz fixture',-980003,current_setting('test.owner')::uuid);
DO $test$ BEGIN
  IF (SELECT count(*) FROM tasks WHERE id IN(-980002,-980003,-980004) AND imported_title_locked)<>3 THEN
    RAISE EXCEPTION 'Import triggers failed to lock tasks';
  END IF;
END $test$;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.editor'),'role','authenticated')::text,true);
DO $test$
DECLARE fixture_task_id bigint;
BEGIN
  FOREACH fixture_task_id IN ARRAY ARRAY[-980002,-980003,-980004]::bigint[] LOOP
    BEGIN
      UPDATE tasks SET title='Forbidden',updated_by=current_setting('test.owner')::uuid WHERE id=fixture_task_id;
      RAISE EXCEPTION 'Non-eshop title update succeeded';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
  BEGIN
    UPDATE tasks SET imported_title_locked=false,title='Bypass attempt' WHERE id=-980002;
    RAISE EXCEPTION 'Unlock attempt succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO imported_task_title_editors(user_id) VALUES(current_setting('test.editor')::uuid);
    RAISE EXCEPTION 'Editor self-escalation succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE tasks SET title='Manual title updated',is_skroutz=true WHERE id=-980001;
  IF NOT FOUND THEN RAISE EXCEPTION 'Manual title update did not affect row'; END IF;
  UPDATE tasks SET title='Manually flagged Skroutz still editable' WHERE id=-980001;
  UPDATE tasks SET completed=true,position=5,needs_weighing=true WHERE id=-980003;
  IF NOT FOUND THEN RAISE EXCEPTION 'Other imported task fields blocked'; END IF;
  INSERT INTO task_notes(id,task_id,content,created_by) OVERRIDING SYSTEM VALUE
  VALUES(-981001,-980002,'Quantity reset fixture',current_setting('test.editor')::uuid);
  DELETE FROM softone_imported_items WHERE task_id=-980004;
  BEGIN
    UPDATE tasks SET title='Deleted history bypass attempt' WHERE id=-980004;
    RAISE EXCEPTION 'History deletion unlocked title';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $test$;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.owner'),'role','authenticated')::text,true);
DO $test$ BEGIN
  UPDATE tasks SET title='eshop edited imported title' WHERE id=-980003;
  IF NOT FOUND THEN RAISE EXCEPTION 'eshop cannot edit imported title'; END IF;
  UPDATE tasks SET title='Import | ΑΛΛΑΓΗ ΠΟΣΟΤΗΤΑΣ 2→1',stock_status='limited',stock_quantity=1 WHERE id=-980002;
  UPDATE softone_imported_items SET quantity=1 WHERE task_id=-980002;
  IF EXISTS(SELECT 1 FROM task_notes WHERE task_id=-980002) THEN RAISE EXCEPTION 'Quantity reset did not clear notes'; END IF;
  IF NOT EXISTS(SELECT 1 FROM tasks WHERE id=-980002 AND stock_status='none' AND stock_quantity IS NULL AND title='Import | ΑΛΛΑΓΗ ΠΟΣΟΤΗΤΑΣ 2→1') THEN
    RAISE EXCEPTION 'Quantity reset broke stock or title marker';
  END IF;
  UPDATE skroutz_imported_items SET task_id=-980005 WHERE id=-980003;
  IF NOT EXISTS(SELECT 1 FROM tasks WHERE id=-980005 AND imported_title_locked) THEN RAISE EXCEPTION 'Relink did not protect replacement task'; END IF;
END $test$;
ROLLBACK;
SELECT 'PASS: both imports locked; manual editable; eshop allowed; other fields and quantity reset intact; bypasses denied; all fixtures rolled back' AS result;
