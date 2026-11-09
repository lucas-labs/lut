# lut-shell-integration (bashrc)
#
# Differences vs zsh integration:
# - We emulate login-shell init manually (/etc/profile, profile files) because
#   bash ignores --rcfile when started with -l.
# - Pre-exec marker uses PS0 (bash 4.4+). On older bash (macOS default 3.2) we
#   skip it — a fragile DEBUG-trap alternative would clobber the user's own
#   traps and interact badly with debuggers.

if [ -z "${__LUT_HOOKS_LOADED-}" ]; then
  __LUT_HOOKS_LOADED=1

  [ -f /etc/profile ] && source /etc/profile
  [ -f /etc/bashrc ] && source /etc/bashrc
  if [ -f "$HOME/.bash_profile" ]; then
    source "$HOME/.bash_profile"
  elif [ -f "$HOME/.bash_login" ]; then
    source "$HOME/.bash_login"
  elif [ -f "$HOME/.profile" ]; then
    source "$HOME/.profile"
  fi
  # .bashrc may have been sourced already by .bash_profile; sourcing again is
  # safe for idempotent rc files (the common case). If yours has side effects
  # on reload, guard with a flag.
  [ -f "$HOME/.bashrc" ] && source "$HOME/.bashrc"

  # Bash before 4.4 has no PS0, so it never reports that a command started. The
  # option tells the host (the name predates the removal of block mode), which
  # then never types a command on the user's behalf into this shell.
  _lut_prompt_end='\[\e]133;B\e\\\]'
  if [ "${BASH_VERSINFO[0]:-0}" -lt 4 ] \
     || { [ "${BASH_VERSINFO[0]:-0}" -eq 4 ] && [ "${BASH_VERSINFO[1]:-0}" -lt 4 ]; }; then
    _lut_prompt_end='\[\e]133;B;lut_blocks=0\e\\\]'
  fi

  if [ -n "${LUT_CLI-}" ] && [ -x "${LUT_CLI-}" ]; then
    lut() {
      command "$LUT_CLI" "$@"
    }
  fi

  # URL-encodes $1 into REPLY; no command substitution, a fork per prompt is
  # pure latency.
  _lut_urlencode() {
    local LC_ALL=C s="$1" i c
    REPLY=
    for (( i=0; i<${#s}; i++ )); do
      c="${s:i:1}"
      case "$c" in
        [a-zA-Z0-9/._~-]) REPLY+="$c" ;;
        *) printf -v c '%%%02X' "'$c"; REPLY+="$c" ;;
      esac
    done
  }

  # Reports the prompt for the command status in $1; forks nothing.
  _lut_report() {
    local _lut_cwd="$PWD" REPLY
    printf '\e]133;D;%s\e\\' "$1"
    case "$_lut_cwd" in
      *[!a-zA-Z0-9/._~-]*) _lut_urlencode "$_lut_cwd"; _lut_cwd="$REPLY" ;;
    esac
    printf '\e]7;file://%s%s\e\\' "${HOSTNAME:-localhost}" "$_lut_cwd"
    printf '\e]133;A\e\\'
  }

  # Returns the status it was called with, so the PROMPT_COMMAND entries after
  # it (starship, direnv, ...) still see the user's `$?`.
  _lut_precmd() {
    local _lut_ret=$?
    _lut_report "$_lut_ret"
    return "$_lut_ret"
  }

  # Runs last in PROMPT_COMMAND, after every prompt framework (starship, ...)
  # rebuilt PS1: the prompt end goes after the prompt text. Appended again
  # whenever a framework dropped it; forks nothing.
  _lut_finish_prompt() {
    local _lut_ret=$?
    case "${PS1-}" in
      *']133;B'*) ;;
      *) PS1="${PS1-}${_lut_prompt_end}" ;;
    esac
    return "$_lut_ret"
  }

  # bash 5.1 runs every element of an array PROMPT_COMMAND; older versions run
  # only element 0, where the array has to be treated as one command string.
  _lut_pc_runs_arrays() {
    [ "${BASH_VERSINFO[0]:-0}" -gt 5 ] \
      || { [ "${BASH_VERSINFO[0]:-0}" -eq 5 ] && [ "${BASH_VERSINFO[1]:-0}" -ge 1 ]; }
  }

  # Bash versions that execute all entries also expose variable attributes
  # without a fork. Testing index 1 misses empty, single and sparse arrays.
  _lut_pc_is_array() {
    if _lut_pc_runs_arrays; then
      # Attribute expansion on an unset array trips nounset; restore options
      # automatically when this function returns.
      local -
      set +u
      [[ ${PROMPT_COMMAND@a} == *a* ]]
    else
      [ -n "${PROMPT_COMMAND[1]+set}" ]
    fi
  }

  # Puts _lut_finish_prompt last in PROMPT_COMMAND, once. Called again by the
  # ble.sh hook, which restores a PROMPT_COMMAND that never saw it.
  _lut_pc_finish_last() {
    case "${PROMPT_COMMAND[*]-}" in *_lut_finish_prompt*) return 0 ;; esac
    if _lut_pc_is_array; then
      if _lut_pc_runs_arrays; then
        PROMPT_COMMAND+=(_lut_finish_prompt)
      else
        PROMPT_COMMAND[0]="${PROMPT_COMMAND[0]-}"$'\n'"_lut_finish_prompt"
      fi
    else
      PROMPT_COMMAND="${PROMPT_COMMAND:+$PROMPT_COMMAND$'\n'}_lut_finish_prompt"
    fi
  }

  # ble.sh runs this from its own PRECMD hook list (see below). When a
  # PROMPT_COMMAND that still names _lut_precmd is going to run anyway, as it
  # does for a ble.sh that attaches from the prompt, this only makes sure the
  # prompt end still runs last, so the prompt is never reported twice.
  _lut_ble_precmd() {
    local _lut_ret=$?
    case "${PROMPT_COMMAND[*]-}" in
      *_lut_precmd*) ;;
      *) _lut_report "$_lut_ret" ;;
    esac
    _lut_pc_finish_last
    return "$_lut_ret"
  }

  if _lut_pc_is_array; then
    if _lut_pc_runs_arrays; then
      _lut_has_precmd=
      for _lut_command in "${PROMPT_COMMAND[@]}"; do
        [ "$_lut_command" = _lut_precmd ] && _lut_has_precmd=1
      done
      if [ -z "$_lut_has_precmd" ]; then
        PROMPT_COMMAND=(_lut_precmd "${PROMPT_COMMAND[@]}")
      fi
      unset _lut_has_precmd _lut_command
    else
      case "${PROMPT_COMMAND[0]-}" in
        *_lut_precmd*) ;;
        *) PROMPT_COMMAND[0]="_lut_precmd${PROMPT_COMMAND[0]:+;${PROMPT_COMMAND[0]}}" ;;
      esac
    fi
  else
    case "${PROMPT_COMMAND:-}" in
      *_lut_precmd*) ;;
      *) PROMPT_COMMAND="_lut_precmd${PROMPT_COMMAND:+;$PROMPT_COMMAND}" ;;
    esac
  fi
  _lut_pc_finish_last

  # An attached ble.sh keeps its own copy of PROMPT_COMMAND, restores it before
  # every prompt and drops what was added behind its back, so the hook above
  # is never called and the host sees one OSC 7 at startup and nothing after.
  # Its own hook list survives that; `!=` adds an entry only once.
  if [ -n "${BLE_VERSION-}" ] && declare -F blehook >/dev/null 2>&1; then
    blehook PRECMD!=_lut_ble_precmd 2>/dev/null \
      || blehook PRECMD+=_lut_ble_precmd 2>/dev/null
  fi

  # Pre-exec marker via PS0 (bash 4.4+). PS0 is expanded just before a command
  # runs — cleaner than a DEBUG trap, which would clobber user traps and fire
  # on every command including inside PROMPT_COMMAND.
  if [ "${BASH_VERSINFO[0]:-0}" -gt 4 ] \
     || { [ "${BASH_VERSINFO[0]:-0}" -eq 4 ] && [ "${BASH_VERSINFO[1]:-0}" -ge 4 ]; }; then
    PS0='\[\e]133;C\e\\\]'"${PS0:-}"
  fi

  _lut_precmd
fi
:
