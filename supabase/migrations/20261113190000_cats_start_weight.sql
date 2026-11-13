-- The weight she gives at onboarding is an estimate, so it is stored on the cat,
-- not as a weigh-in. Kidney Watch's weight rule uses only real two-step weigh-ins.
alter table cats add column start_weight_lb numeric(5,2) check (start_weight_lb > 0 and start_weight_lb < 60);
