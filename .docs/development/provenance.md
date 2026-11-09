# Provenance and change policy

lut began as an import of [Terax](https://github.com/crynta/terax-ai)'s source at commit
`a2c0877d7fe81ed7b9560c3043d4b6c1ad9783c9` ([ADR-001](../decisions/0001-technical-base.md)). From then on the
imported code is lut's own code (proposal §14.4).

## There is no upstream

No Terax remote is configured, nothing is merged from Terax and nothing is synced periodically. The origin commit is
kept only as provenance and attribution data: in the README credit note, in `NOTICE` and in
`.docs/origin-terax/ORIGIN.md`. Terax's own documentation in `.docs/origin-terax/` is reference material, not lut's
rules.

## The three rules

1. **Terax fixes are ported by hand, one at a time.** If Terax fixes something lut also needs (for example a PTY or
   ConPTY security fix), it is reimplemented as an ordinary lut change through an issue, with its own test that fails
   without the fix. It is a one-off decision, not a process: nobody tracks Terax's releases.
2. **Code can be renamed, moved or rewritten freely.** Compatibility with Terax is never a reason to keep a name, a
   file layout or an API. What does constrain a change are lut's technical invariants (the shared renderer, the
   persistently mounted sessions, the shell bridge and the hooks; proposal §5.4 and §6) and the tests.
3. **Visual changes and engine changes go in separate commits.** Customisation of the UI (styles, layout, components,
   copy) never shares a commit with a change to the engine: the PTY, the renderer or the control protocol. That way a
   regression can be traced to one side and reverted without the other. Change control lists this rule too
   ([change control](change-control.md#branches-and-commits)).

## Legal notices stay

Renaming and rewriting never remove Terax's copyright, the license files or the attributions of third-party
components; see [licensing](../licensing.md).
