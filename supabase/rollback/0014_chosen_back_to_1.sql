-- Rollback for 0014 (owner, 2026-10-18: "have the rollback (chosen version back to 1) ready as one command").
-- Points the owner's page back at version 1, the open-weight cut. Version 2 stays as a row (versions are
-- never deleted; its fixed link /@naaate/1/v/2 keeps working). Run in the Supabase SQL Editor as postgres.
update studio.adaptation_pages set version_id = 1, updated_at = now() where person = 6786 and adaptation_id = 1;
