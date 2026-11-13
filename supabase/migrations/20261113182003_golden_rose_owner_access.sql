begin;

create schema golden_rose_access;
revoke all on schema golden_rose_access from public, anon, authenticated, service_role;
grant usage on schema golden_rose_access to authenticated;

create table golden_rose_access.owner_invitations (
  id uuid primary key default gen_random_uuid(),
  recipient uuid not null,
  email text not null,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  invited_by uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz
);
create unique index one_open_owner_invitation on golden_rose_access.owner_invitations (recipient)
where accepted_at is null and revoked_at is null;

create table golden_rose_access.owner_events (
  id bigint generated always as identity primary key,
  action text not null,
  actor uuid,
  subject uuid not null,
  invitation_id uuid,
  operator text not null default session_user,
  reference text,
  happened_at timestamptz not null default now()
);
alter table golden_rose_access.owner_invitations enable row level security;
alter table golden_rose_access.owner_events enable row level security;
revoke all on all tables in schema golden_rose_access from public, anon, authenticated, service_role;

-- Records all owner membership changes, including privileged maintenance outside the app.
create function golden_rose_access.audit_owner()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.role = 'owner' then
      insert into golden_rose_access.owner_events(action,actor,subject,reference)
      values ('owner_granted',auth.uid(),new.user_id,new.status);
    end if;
  elsif tg_op = 'DELETE' then
    if old.role = 'owner' then
      insert into golden_rose_access.owner_events(action,actor,subject,reference)
      values ('owner_removed',auth.uid(),old.user_id,old.status);
    end if;
  elsif (old.role = 'owner' or new.role = 'owner') and (old.role,old.status) is distinct from (new.role,new.status) then
    insert into golden_rose_access.owner_events(action,actor,subject,reference)
    values (case when new.role <> 'owner' then 'owner_removed'
      when old.role <> 'owner' then 'owner_granted'
      when new.status = 'suspended' then 'owner_suspended'
      else 'owner_restored' end, auth.uid(),new.user_id,old.role || '/' || old.status || ' → ' || new.role || '/' || new.status);
  end if;
  return null;
end;
$$;
create trigger audit_owner_membership after insert or update or delete on golden_rose.staff_members
for each row execute function golden_rose_access.audit_owner();

-- Privileged SQL operator only. The caller supplies a known Auth UUID, expected email, and change reference.
create function golden_rose_access.bootstrap_owner(p_user uuid,p_email text,p_reference text)
returns void language plpgsql security invoker set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(109071,2);
  if exists(select 1 from golden_rose.staff_members where role='owner')
    or exists(select 1 from golden_rose_access.owner_events where action in ('owner_granted','bootstrap'))
  then raise exception 'Owner bootstrap has already been completed.' using errcode='42501'; end if;
  if length(btrim(coalesce(p_reference,''))) not between 8 and 300
    or not exists(select 1 from auth.users where id=p_user and lower(email)=lower(btrim(p_email))
      and email_confirmed_at is not null and not coalesce(is_anonymous,false)
      and (banned_until is null or banned_until <= now()))
  then raise exception 'Provide the verified intended account and an approval reference.' using errcode='22023'; end if;
  if exists(select 1 from golden_rose.staff_members where user_id=p_user) then
    raise exception 'The intended account already has a staff membership.' using errcode='22023';
  end if;
  insert into golden_rose.staff_members(user_id,role,status) values (p_user,'owner','active');
  insert into golden_rose_access.owner_events(action,subject,reference)
    values ('bootstrap',p_user,btrim(p_reference));
end;
$$;

create function golden_rose_access.manage(p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  recipient_id uuid;
  recipient_email text;
  requested_email text := lower(btrim(coalesce(p_payload->>'email','')));
  requested_hash text := p_payload->>'tokenHash';
  invitation golden_rose_access.owner_invitations;
begin
  if actor_id is null then raise exception 'Sign in to continue.' using errcode='42501'; end if;
  -- One lock serializes invitation consumption and owner membership changes.
  perform pg_advisory_xact_lock(109071,2);
  if p_action = 'accept' then
    if coalesce(requested_hash,'') !~ '^[0-9a-f]{64}$' then raise exception 'Invitation unavailable.' using errcode='22023'; end if;
    select * into invitation from golden_rose_access.owner_invitations i
      where i.token_hash = requested_hash and i.recipient = actor_id
        and i.expires_at > now() and i.accepted_at is null and i.revoked_at is null;
    if not found or not exists(select 1 from auth.users u where u.id=actor_id and lower(u.email)=invitation.email
        and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
        and (u.banned_until is null or u.banned_until <= now()))
      or not exists(select 1 from golden_rose.staff_members where user_id=invitation.invited_by and role='owner' and status='active' for share)
      or exists(select 1 from golden_rose.staff_members where user_id=actor_id)
    then raise exception 'Invitation is invalid, expired, already used, or for another account.' using errcode='22023'; end if;
    insert into golden_rose.staff_members(user_id,role,status) values(actor_id,'owner','active');
    update golden_rose_access.owner_invitations set accepted_at=now() where id=invitation.id;
    insert into golden_rose_access.owner_events(action,actor,subject,invitation_id)
      values('invitation_accepted',actor_id,actor_id,invitation.id);
    return jsonb_build_object('ok',true);
  end if;

  perform 1 from golden_rose.staff_members where user_id=actor_id and role='owner' and status='active' for share;
  if not found then raise exception 'Active owner access required.' using errcode='42501'; end if;

  if p_action = 'list' then
    return jsonb_build_object(
      'owners',(select coalesce(jsonb_agg(jsonb_build_object('id',s.user_id,'email',u.email,'status',s.status) order by s.created_at),'[]')
        from golden_rose.staff_members s join auth.users u on u.id=s.user_id where s.role='owner'),
      'invitations',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'email',i.email,'expiresAt',i.expires_at) order by i.created_at desc),'[]')
        from golden_rose_access.owner_invitations i where i.accepted_at is null and i.revoked_at is null and i.expires_at>now()),
      'audit',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'action',e.action,'actor',e.actor,'subject',e.subject,'at',e.happened_at)
        order by e.id desc),'[]') from (select * from golden_rose_access.owner_events order by id desc limit 20) e)
    );
  elsif p_action = 'invite' then
    if length(requested_email) not between 3 and 254 or coalesce(requested_hash,'') !~ '^[0-9a-f]{64}$' then
      raise exception 'Provide the confirmed recipient email.' using errcode='22023';
    end if;
    select u.id, lower(u.email) into recipient_id,recipient_email from auth.users u where lower(u.email)=requested_email
      and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
      and (u.banned_until is null or u.banned_until <= now())
      and (select count(*) from auth.users candidate where lower(candidate.email)=requested_email)=1
      for share;
    if recipient_id is null or exists(select 1 from golden_rose.staff_members where user_id=recipient_id) then
      raise exception 'Use a confirmed account with no existing staff membership.' using errcode='22023';
    end if;
    -- Reissuing invalidates the previous code even when the first response was lost.
    with closed as (
      update golden_rose_access.owner_invitations set revoked_at=now() where recipient=recipient_id
        and accepted_at is null and revoked_at is null returning id
    )
    insert into golden_rose_access.owner_events(action,actor,subject,invitation_id)
      select 'invitation_revoked',actor_id,recipient_id,id from closed;
    insert into golden_rose_access.owner_invitations(recipient,email,token_hash,invited_by,expires_at)
      values(recipient_id,recipient_email,requested_hash,actor_id,now()+interval '24 hours') returning * into invitation;
    insert into golden_rose_access.owner_events(action,actor,subject,invitation_id)
      values('invitation_created',actor_id,recipient_id,invitation.id);
  elsif p_action = 'revoke' then
    update golden_rose_access.owner_invitations set revoked_at=now()
      where id=(p_payload->>'id')::uuid and accepted_at is null and revoked_at is null returning * into invitation;
    if not found then raise exception 'This invitation is no longer open.' using errcode='22023'; end if;
    insert into golden_rose_access.owner_events(action,actor,subject,invitation_id)
      values('invitation_revoked',actor_id,invitation.recipient,invitation.id);
  elsif p_action in ('suspend','restore','remove') then
    recipient_id := (p_payload->>'id')::uuid;
    if recipient_id = actor_id then raise exception 'Another active owner must change your access.' using errcode='22023'; end if;
    if p_action = 'remove' then
      delete from golden_rose.staff_members where user_id=recipient_id and role='owner' and status='suspended';
    else
      update golden_rose.staff_members set status=case when p_action='suspend' then 'suspended' else 'active' end, updated_at=now()
        where user_id=recipient_id and role='owner' and status=case when p_action='suspend' then 'active' else 'suspended' end;
    end if;
    if not found then raise exception 'The owner status already changed or is unavailable.' using errcode='22023'; end if;
    if p_action='suspend' then
      with closed as (
        update golden_rose_access.owner_invitations set revoked_at=now() where invited_by=recipient_id
          and accepted_at is null and revoked_at is null returning id,recipient
      )
      insert into golden_rose_access.owner_events(action,actor,subject,invitation_id)
        select 'invitation_revoked',actor_id,recipient,id from closed;
    end if;
  else
    raise exception 'Unsupported owner action.' using errcode='22023';
  end if;
  return jsonb_build_object('ok',true);
end;
$$;

create function public.gr_owner_access(p_action text,p_payload jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path = ''
as $$ select golden_rose_access.manage(p_action,p_payload); $$;

revoke all on all functions in schema golden_rose_access from public, anon, authenticated, service_role;
grant execute on function golden_rose_access.manage(text,jsonb) to authenticated;
revoke all on function public.gr_owner_access(text,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.gr_owner_access(text,jsonb) to authenticated;

commit;
