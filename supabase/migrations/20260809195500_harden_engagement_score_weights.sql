alter table public.engagement_score_weights
  add constraint engagement_score_weights_weight_name_check
  check (
    weight_name in (
      'login_frequency_weight',
      'pulse_survey_completion_weight',
      'data_submission_weight',
      'intervention_follow_up_weight',
      'trend_consistency_weight'
    )
  );

create or replace function public.touch_engagement_score_weights_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_engagement_score_weights_updated_at on public.engagement_score_weights;

create trigger set_engagement_score_weights_updated_at
before update on public.engagement_score_weights
for each row
execute function public.touch_engagement_score_weights_updated_at();
