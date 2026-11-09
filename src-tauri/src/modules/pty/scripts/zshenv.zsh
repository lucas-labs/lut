# lut-shell-integration (zshenv)
#
# lut points ZDOTDIR at its integration directory so zsh reads these wrappers
# first. The user's files are sourced with ZDOTDIR switched back to their own
# directory, so `$ZDOTDIR/conf.d/*.zsh` style loaders resolve where they expect.
# A ZDOTDIR the user's .zshenv sets itself is remembered in LUT_USER_ZDOTDIR,
# otherwise zsh would continue with their .zshrc and skip ours.
#
# Trailing `:` is load-bearing — without it, a missing user .zshenv leaves $?=1,
# which propagates through the rest of init and ultimately into the first
# prompt's `%?` (rendering robbyrussell's `➜` red on a clean shell start).
{
  _lut_zdotdir="$ZDOTDIR"
  _lut_assigned="${LUT_USER_ZDOTDIR:-$HOME}"
  ZDOTDIR="$_lut_assigned"
  [ -f "$_lut_assigned/.zshenv" ] && source "$_lut_assigned/.zshenv"
  if [[ "${ZDOTDIR-}" != "$_lut_assigned" || -n "${LUT_USER_ZDOTDIR-}" ]]; then
    export LUT_USER_ZDOTDIR="${ZDOTDIR:-$HOME}"
  fi
  # An interactive shell goes on to our .zprofile and .zshrc; a script or
  # `zsh -c` reads nothing else, so it keeps the user's own ZDOTDIR.
  if [[ -o interactive ]]; then
    ZDOTDIR="$_lut_zdotdir"
  elif [[ -n "${LUT_USER_ZDOTDIR-}" ]]; then
    ZDOTDIR="$LUT_USER_ZDOTDIR"
  else
    unset ZDOTDIR
  fi
  unset _lut_zdotdir _lut_assigned
}
:
