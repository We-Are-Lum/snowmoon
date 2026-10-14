-- 0012: the prepaid circuit breaker's alerts (owner, 2026-10-14).
--
-- NOT APPLIED. The owner applies migrations by hand; until then the prepaid alerts log a failure and
-- Generates carry on (src/lib/images/alert.ts, alertPrepaid).
--
-- studio.alert_state (0010) held only 'reports'. It now also holds 'prepaid-50' and 'prepaid-100':
-- the last time each share of IMAGES.prepaid.safetyCapUsd was announced, so each goes out once per
-- UTC day across every server. No wallet, amount or person is stored.

alter table studio.alert_state drop constraint alert_state_kind_check;
alter table studio.alert_state add constraint alert_state_kind_check check (kind in ('reports', 'prepaid-50', 'prepaid-100'));
