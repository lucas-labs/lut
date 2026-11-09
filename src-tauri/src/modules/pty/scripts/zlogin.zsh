# lut-shell-integration (zlogin)
#
# zshrc.zsh normally hands ZDOTDIR back to the user, so zsh reads their own
# .zlogin directly and this file is not used. It stays for shells that reach it
# with the integration directory still in place.
#
# It is the LAST init file zsh runs before entering the prompt loop, so its
# exit status becomes `$?` for the very first prompt. Without the trailing `:`,
# users without a personal ~/.zlogin (the common case) hit a non-zero $? on
# first render — themes that condition prompt color on `%?` (robbyrussell etc.)
# show a red error indicator on a clean shell start.
{
  _lut_zdotdir="$ZDOTDIR"
  _lut_user_zdotdir="${LUT_USER_ZDOTDIR:-$HOME}"
  ZDOTDIR="$_lut_user_zdotdir"
  [ -f "$_lut_user_zdotdir/.zlogin" ] && source "$_lut_user_zdotdir/.zlogin"
  ZDOTDIR="$_lut_zdotdir"
  unset _lut_zdotdir _lut_user_zdotdir
}
:
