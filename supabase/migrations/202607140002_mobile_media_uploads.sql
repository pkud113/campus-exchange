-- Support modern mobile photos while retaining all existing media rows.
alter table public.media_uploads
  drop constraint if exists media_uploads_content_type_check;

alter table public.media_uploads
  add constraint media_uploads_content_type_check
  check (content_type in ('image/webp', 'image/png', 'image/jpeg', 'image/heic', 'image/heif'));

alter table public.media_uploads
  drop constraint if exists media_uploads_byte_size_check;

alter table public.media_uploads
  add constraint media_uploads_byte_size_check
  check (byte_size between 1 and 20971520);
