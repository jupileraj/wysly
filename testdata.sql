-- Test data voor info@wijzijnwys.nl
-- Voer dit uit in Supabase SQL Editor

DO $$
DECLARE
  v_user_id uuid;
  v_wp_id   uuid;
  v_dp_ma   uuid;
  v_dp_di   uuid;
  v_dp_wo   uuid;
  v_dp_do   uuid;
  v_dp_vr   uuid;
  v_goal1   uuid;
  v_goal2   uuid;
  v_goal3   uuid;
BEGIN

  -- Haal user ID op
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'info@wijzijnwys.nl';
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Gebruiker niet gevonden'; END IF;
  RAISE NOTICE 'User ID: %', v_user_id;

  -- Profiel bijwerken
  UPDATE profiles SET name = 'Anne Jan', contract_hours = 40, role = 'admin'
  WHERE id = v_user_id;

  -- Verwijder bestaand weekplan voor deze week (cascaded)
  DELETE FROM week_plans WHERE user_id = v_user_id AND week_start = '2026-04-06';

  -- Week plan aanmaken
  INSERT INTO week_plans (user_id, week_start)
  VALUES (v_user_id, '2026-04-06')
  RETURNING id INTO v_wp_id;
  RAISE NOTICE 'Week plan ID: %', v_wp_id;

  -- Dag plannen invoegen
  INSERT INTO day_plans (week_plan_id, day_of_week, is_working, start_time, end_time)
  VALUES (v_wp_id, 0, true, '09:00', '17:30') RETURNING id INTO v_dp_ma;

  INSERT INTO day_plans (week_plan_id, day_of_week, is_working, start_time, end_time)
  VALUES (v_wp_id, 1, true, '09:00', '17:30') RETURNING id INTO v_dp_di;

  INSERT INTO day_plans (week_plan_id, day_of_week, is_working, start_time, end_time)
  VALUES (v_wp_id, 2, true, '09:00', '17:30') RETURNING id INTO v_dp_wo;

  INSERT INTO day_plans (week_plan_id, day_of_week, is_working, start_time, end_time)
  VALUES (v_wp_id, 3, true, '09:00', '17:30') RETURNING id INTO v_dp_do;

  INSERT INTO day_plans (week_plan_id, day_of_week, is_working, start_time, end_time)
  VALUES (v_wp_id, 4, true, '09:00', '16:00') RETURNING id INTO v_dp_vr;

  INSERT INTO day_plans (week_plan_id, day_of_week, is_working, start_time, end_time)
  VALUES (v_wp_id, 5, false, null, null);

  INSERT INTO day_plans (week_plan_id, day_of_week, is_working, start_time, end_time)
  VALUES (v_wp_id, 6, false, null, null);

  RAISE NOTICE 'Dag plannen aangemaakt';

  -- Weekdoelen
  INSERT INTO week_goals (week_plan_id, goal_text, client_id, sort_order)
  VALUES (v_wp_id, 'Nieuwe propositie uitwerken', null, 0)
  RETURNING id INTO v_goal1;

  INSERT INTO week_goals (week_plan_id, goal_text, client_id, sort_order)
  VALUES (v_wp_id, 'Offertes versturen voor Q2', null, 1)
  RETURNING id INTO v_goal2;

  INSERT INTO week_goals (week_plan_id, goal_text, client_id, sort_order)
  VALUES (v_wp_id, 'Team check-in plannen', null, 2)
  RETURNING id INTO v_goal3;

  RAISE NOTICE 'Weekdoelen aangemaakt';

  -- Taken maandag
  INSERT INTO tasks (day_plan_id, task_text, sort_order, client_id, week_goal_id) VALUES
    (v_dp_ma, 'Propositie eerste versie schrijven', 0, null, v_goal1),
    (v_dp_ma, 'Offertetemplate updaten',            1, null, v_goal2),
    (v_dp_ma, 'Mail beantwoorden',                  2, null, null);

  -- Taken dinsdag
  INSERT INTO tasks (day_plan_id, task_text, sort_order, client_id, week_goal_id) VALUES
    (v_dp_di, 'Feedback verwerken propositie', 0, null, v_goal1),
    (v_dp_di, 'Klantgesprek voorbereiden',     1, null, null),
    (v_dp_di, 'Facturen controleren',          2, null, null);

  -- Taken woensdag
  INSERT INTO tasks (day_plan_id, task_text, sort_order, client_id, week_goal_id) VALUES
    (v_dp_wo, 'Klantgesprek voeren',       0, null, null),
    (v_dp_wo, 'Offertes versturen',        1, null, v_goal2),
    (v_dp_wo, 'Team check-in inplannen',   2, null, v_goal3);

  -- Taken donderdag
  INSERT INTO tasks (day_plan_id, task_text, sort_order, client_id, week_goal_id) VALUES
    (v_dp_do, 'Propositie afronden en versturen', 0, null, v_goal1),
    (v_dp_do, 'Team check-in uitvoeren',          1, null, v_goal3),
    (v_dp_do, 'Administratie bijwerken',          2, null, null);

  -- Taken vrijdag
  INSERT INTO tasks (day_plan_id, task_text, sort_order, client_id, week_goal_id) VALUES
    (v_dp_vr, 'Weekoverzicht opstellen',      0, null, null),
    (v_dp_vr, 'Openstaande mails afhandelen', 1, null, null);

  RAISE NOTICE 'Klaar! Alle data aangemaakt voor %', v_user_id;
END $$;
