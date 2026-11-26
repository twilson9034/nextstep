# NextStep v0.4.3.2 child-access testing checklist

Use this checklist for each development release that changes accounts, managed profiles, tasks, or personalization. Record the commit and the devices tested. Use disposable households and accounts for manual testing.

## Verified in development

- [x] TypeScript and Vite production build passes using `npm run build`.
- [x] Verified email recipient can accept the invitation. An unrelated account cannot see or claim it. Repeated acceptance is safe.
- [x] Child accounts cannot create households. Parent preferences stay private. Only the child’s assigned household tasks are visible. Archiving removes household task access and preserves preferences.
- [x] An email-free device can pair while signed out. A redeemed code cannot pair a second device.
- [x] Two independently paired devices share the same child’s saved setup. An outdated save is rejected.
- [x] Linking a verified email account later carries the managed profile’s saved settings into that account.
- [x] Wrong parent PIN triggers a cooldown. A valid PIN disconnects the device. The owner can revoke a different device.
- [x] Chromium with simulated API responses covered parent code creation, signed-out device pairing, assigned tasks, wizard autosave and resume after reload, and PIN disconnect.
- [x] Prior browser regression covered email invitation creation and cancellation, acceptance, wizard resume, brain styles, strengths, and decision preferences in isolated browser sessions with simulated authentication.

The database regression scripts use temporary fixtures and roll back at the end. Run both against the development schema after applying its migrations.

- [Email linking and account isolation](../tests/child_accounts.sql)
- [Managed devices and PIN controls](../tests/managed_devices.sql)

## Hands-on device acceptance

- [ ] On a parent phone, open Settings → Household and family, select a household, and open **Set up child access without email** under an existing child. Create a code with a device name and a six-digit parent PIN.
- [ ] Pair a signed-out child device through **Use a child device code**. Check the child name and assigned tasks. Verify the parent phone stays signed in.
- [ ] Try an expired code, a previously used code, and a pending code revoked by the owner. Each must be refused.
- [ ] On a shared tablet, choose **Use this device for child mode**. Reload and use browser Back. The parent workspace should require a fresh sign-in. Verify a wrong PIN and then the correct PIN after the cooldown.
- [ ] Change support styles, strengths, decision preferences and assistance. Wait for **Progress saved**, reopen the PWA, and verify the same selections on a second paired device.
- [ ] Make conflicting edits on two devices. Verify the stale edit is flagged and the latest saved preferences can be reloaded.
- [ ] Assign separate tasks to two siblings. Check each paired device only sees its child’s tasks. Check normal adult task creation and household management.
- [ ] Revoke one paired device from the parent account. Bring it online and focus or refresh it. Verify the other device still works.
- [ ] Archive and restore a child. Old codes and paired devices must stay invalid after restoration. Pair a new device and check saved preferences.
- [ ] Complete a real email signup and confirmation, then accept the optional child invitation. Verify the email sign-in and already-paired device use the same profile.
- [ ] Repeat pairing, reopen, and revoke in Safari and the installed iOS Home Screen PWA. Record device, OS, result and any issue below.

| Commit | Device / browser | Scenario | Result / issue |
| --- | --- | --- | --- |
