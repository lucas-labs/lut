# lut-shell-integration (zprofile)
#
# See zshenv.zsh for how ZDOTDIR is handled and the rationale on the trailing `:`.
{
  _lut_zdotdir="$ZDOTDIR"
  _lut_user_zdotdir="${LUT_USER_ZDOTDIR:-$HOME}"
  ZDOTDIR="$_lut_user_zdotdir"
  [ -f "$_lut_user_zdotdir/.zprofile" ] && source "$_lut_user_zdotdir/.zprofile"
  if [[ "${ZDOTDIR-}" != "$_lut_user_zdotdir" || -n "${LUT_USER_ZDOTDIR-}" ]]; then
    export LUT_USER_ZDOTDIR="${ZDOTDIR:-$HOME}"
  fi
  ZDOTDIR="$_lut_zdotdir"
  unset _lut_zdotdir _lut_user_zdotdir
}
:
