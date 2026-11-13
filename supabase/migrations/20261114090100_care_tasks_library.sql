-- The care-plan library: short, plain-English daily tasks (decisions.md: "rules, not AI,
-- about 60 tagged tasks, three a day per cat"). The picker lives in src/lib/care-plan.ts.
--
-- Who a task is for (every rule must hold):
--   conditions  empty = any cat; otherwise the cat has at least one of these (src/lib/onboarding.ts CONDITIONS)
--   min_age     null = any age; otherwise the cat is at least this many years old
--   tags        lives:<indoor|outdoor|both>  if any lives: tag is present, the cat's lives must be one of them
--               food:<dry|wet|mix>           same for food
--               under:<years>                the cat is younger than this
--               not:<condition>              the cat does not have this condition
--   plus one kind tag: water, play, food, grooming, home, bond, health (the picker puts one water task first).
-- Copy rules: general care only, no medical claims, no plaque or tartar claims, no other brands.

insert into care_tasks (id, title, detail, tags, min_age, conditions) values
-- Water
('water_top_up',        'Top up the clean tank',                 'Fresh water, filled to the line.',                                                   '{water}', null, '{}'),
('water_rinse_basin',   'Rinse the fountain basin',              'A quick rinse keeps the water tasting fresh.',                                       '{water}', null, '{}'),
('water_second_spot',   'Try a second water spot',               'Some cats drink more with water in two rooms.',                                      '{water}', null, '{}'),
('water_away_from_food','Keep water away from the food bowl',    'Many cats prefer to drink a few steps from where they eat.',                         '{water}', null, '{}'),
('water_check_flow',    'Watch the fountain running',            'Check the water flows smoothly and the pump sounds quiet.',                          '{water}', null, '{}'),
('water_after_dry',     'Make water easy to reach after meals',  'Dry food holds little water, so keep the fountain close by.',                        '{water,food:dry,food:mix}', null, '{}'),
('water_splash_wet',    'Add a spoon of water to wet food',      'An easy way to add a little more water to the day.',                                 '{water,food:wet,food:mix}', null, '{}'),
('water_near_rest',     'Put water near the favourite nap spot', 'Fewer steps to a drink makes drinking easier.',                                      '{water}', null, '{kidney,urinary,stiff_joints}'),
('water_count_visits',  'Notice the trips to the water',         'A rough sense of how often helps the daily check-in.',                               '{water}', null, '{kidney,urinary,diabetes,thyroid}'),
('water_level_note',    'Note the water level morning and night','How much goes down in a day is useful to know.',                                     '{water}', null, '{}'),
-- Play
('play_wand',           'Wand play, 10 minutes',                 'Let the toy hide, pause and dart, like real prey.',                                  '{play,not:stiff_joints}', null, '{}'),
('play_gentle',         'Gentle play, 10 minutes',               'Low, slow wand play. Easy on stiff joints.',                                         '{play}', null, '{stiff_joints}'),
('play_floor_level',    'Keep play at floor level',              'Slide toys along the ground instead of asking for jumps.',                           '{play}', null, '{stiff_joints}'),
('play_two_short',      'Two short play sessions',               'Five minutes in the morning, five in the evening.',                                  '{play}', null, '{}'),
('play_food_puzzle',    'Try a food puzzle',                     'Put part of a meal in a puzzle or treat ball so it takes longer.',                   '{play,food:dry,food:mix}', null, '{}'),
('play_treat_hunt',     'Hide a few pieces of food',             'Spread a little of the usual food around a room to hunt for.',                       '{play}', null, '{}'),
('play_rotate_toys',    'Rotate the toys',                       'Put a few away and bring back old ones. Old feels new.',                             '{play}', null, '{}'),
('play_before_bed',     'A big play session before bed',         'Use up young energy before the house goes quiet.',                                   '{play,under:2}', null, '{}'),
('play_box',            'Put out a cardboard box',               'Simple, free, and most cats can''t resist one.',                                     '{play}', null, '{}'),
('play_chase',          'A chase game, 10 minutes',              'Short bursts of running are good for staying trim.',                                 '{play,not:stiff_joints}', null, '{overweight}'),
('play_window',         'Open up a window view',                 'A seat by a window is free entertainment indoors.',                                  '{home,lives:indoor,lives:both}', null, '{}'),
('play_climb',          'Add somewhere to climb',                'A shelf or cat tree gives an indoor cat somewhere to go up.',                        '{home,lives:indoor,not:stiff_joints}', null, '{}'),
-- Food
('food_two_meals',      'Two small meals, not one big one',      'Kinder on a sensitive stomach.',                                                     '{food}', null, '{sensitive_stomach}'),
('food_flat_plate',     'Slow down fast eating',                 'Spread food on a flat plate so it can''t be gulped.',                                '{food}', null, '{sensitive_stomach,overweight}'),
('food_keep_same',      'Keep the food the same this week',      'Sudden food changes are hard on a sensitive stomach.',                               '{food}', null, '{sensitive_stomach}'),
('food_measure',        'Measure today''s food',                 'A measuring cup or kitchen scale keeps portions steady.',                            '{food}', null, '{overweight,diabetes}'),
('food_small_treats',   'Keep treats small',                     'Break treats in half, or use a few pieces of the usual food.',                       '{food}', null, '{overweight}'),
('food_same_times',     'Feed at the same times',                'A steady routine is easy for a cat to rely on.',                                     '{food}', null, '{}'),
('food_vet_plan',       'Keep meals to the vet''s plan',         'Same times and amounts as your vet set.',                                            '{food}', null, '{diabetes,kidney}'),
('food_notice_appetite','Notice appetite today',                 'Were meals finished quickly, slowly, or left?',                                      '{food}', null, '{thyroid,kidney,dental}'),
('food_shallow_bowl',   'Try a wide, shallow bowl',              'Many cats prefer not to brush their whiskers on the sides.',                         '{food}', null, '{}'),
('food_raise_bowl',     'Raise the food bowl a little',          'A low stand can be more comfortable for stiff necks and joints.',                    '{food}', null, '{stiff_joints}'),
('food_soft_option',    'Notice how hard food is chewed',        'Dropping food or chewing on one side is worth telling your vet.',                    '{food}', null, '{dental}'),
('food_wet_lift',       'Lift uneaten wet food after 30 minutes','Wet food left out goes stale quickly.',                                              '{food,food:wet,food:mix}', null, '{}'),
('food_dry_sealed',     'Keep dry food sealed',                  'A closed container keeps it fresh and tasty.',                                       '{food,food:dry,food:mix}', null, '{}'),
-- Grooming and a gentle look-over
('groom_brush',         'Brush for five minutes',                'Good bonding, and it catches loose fur before it''s swallowed.',                     '{grooming}', null, '{}'),
('groom_senior_help',   'Help with grooming',                    'Older cats reach less easily. A soft brush along the back helps.',                   '{grooming}', 10, '{}'),
('groom_claws',         'Check the claws',                       'Look for claws that are long or catching on fabric.',                                '{grooming}', null, '{}'),
('groom_ears',          'A quick look at the ears',              'Clean inside, with no new smell.',                                                   '{grooming}', null, '{}'),
('groom_eyes',          'A quick look at the eyes',              'Bright and clear, with no new discharge.',                                           '{grooming}', null, '{}'),
('groom_lip_look',      'Lift the lip for a quick look',         'Getting used to looking at the mouth makes changes easier to spot.',                 '{grooming}', null, '{}'),
('groom_tooth_brush',   'Practise tooth brushing',               'A finger and a dab of cat toothpaste. A few seconds is a win.',                      '{grooming}', null, '{dental}'),
('groom_hands_over',    'Run your hands over the body',          'Feel for any new lumps, bumps or sore spots.',                                       '{grooming}', 7, '{}'),
('groom_feel_ribs',     'Feel for the ribs',                     'You should feel them under a thin layer, without pressing hard.',                    '{grooming}', null, '{}'),
('groom_after_outdoors','Check the coat after time outside',     'Look for burrs, scratches and hitchhikers like ticks.',                               '{grooming,lives:outdoor,lives:both}', null, '{}'),
-- Home
('home_scoop',          'Scoop the litter box',                  'Twice a day keeps it inviting.',                                                     '{home}', null, '{}'),
('home_clump_note',     'Notice the litter clumps',              'Bigger or more clumps than usual are worth a note.',                                 '{home}', null, '{kidney,diabetes,urinary}'),
('home_litter_watch',   'Watch one trip to the litter box',      'Straining with little coming out means a vet now, any hour.',                        '{home}', null, '{urinary}'),
('home_extra_box',      'Add a second litter box',               'One per cat plus one is a common rule of thumb.',                                    '{home}', null, '{urinary,anxiety}'),
('home_low_entry',      'Make the litter box easy to step into', 'A low side is easier on stiff joints.',                                              '{home}', null, '{stiff_joints}'),
('home_steps',          'Add a step to a favourite spot',        'A stool or ramp up to the couch or bed saves a jump.',                               '{home}', null, '{stiff_joints}'),
('home_warm_bed',       'Put a soft bed somewhere warm',         'Warmth is welcome for older bodies.',                                                '{home}', 10, '{}'),
('home_hiding_spot',    'Offer a quiet hiding spot',             'A covered bed or box where nobody disturbs.',                                        '{home}', null, '{anxiety}'),
('home_calm_routine',   'Keep today''s routine calm',            'Same times for meals and play help an anxious cat settle.',                          '{home}', null, '{anxiety}'),
('home_wash_bowls',     'Wash the food bowls',                   'Warm water and mild soap, then rinse well.',                                         '{home}', null, '{}'),
('home_plants',         'Check the plants in the house',         'Make sure nothing in reach is toxic to cats. Is it safe? can check.',                '{home}', null, '{}'),
('home_cords',          'Tidy loose string and hair ties',       'They''re tempting to play with and risky to swallow.',                               '{home}', null, '{}'),
('home_scratch_post',   'Offer a scratching post',               'A tall, sturdy post saves the furniture.',                                           '{home,lives:indoor,lives:both}', null, '{}'),
('home_collar_tag',     'Check the collar and tag',              'Make sure the contact details are still readable.',                                  '{home,lives:outdoor,lives:both}', null, '{}'),
('home_in_before_dark', 'Call in before dark',                   'Cats are safer indoors overnight.',                                                  '{home,lives:outdoor,lives:both}', null, '{}'),
('home_chip_details',   'Check the microchip contact details',   'An old phone number is the most common reason a chip doesn''t help.',               '{home}', null, '{}'),
-- Bond
('bond_quiet_time',     'Ten quiet minutes together',            'Sit somewhere comfy and let your cat come to you.',                                  '{bond}', null, '{}'),
('bond_slow_blink',     'Try a slow blink',                      'Look softly and blink slowly. Many cats blink back.',                                '{bond}', null, '{}'),
('bond_calm_voice',     'Talk in a calm, low voice',             'A gentle voice during the day helps a nervous cat relax.',                           '{bond}', null, '{anxiety}'),
-- Health habits
('health_weigh_week',   'Weigh in this week',                    'Two quick readings on your bathroom scale, in Kidney Watch.',                        '{health}', null, '{kidney,thyroid,diabetes,overweight}'),
('health_meds_time',    'Keep any medicine on schedule',         'Same times each day, as your vet set.',                                              '{health}', null, '{thyroid,diabetes,kidney}'),
('health_vet_questions','Write down questions for the next vet visit', 'Little things you''ve noticed are easy to forget in the room.',                 '{health}', 7, '{}'),
('health_breathing',    'Count breathing once while asleep',     'Use the breathing counter in Kidney Watch. It takes 30 seconds.',                    '{health}', null, '{}')
on conflict (id) do update set title = excluded.title, detail = excluded.detail, tags = excluded.tags,
  min_age = excluded.min_age, conditions = excluded.conditions;
