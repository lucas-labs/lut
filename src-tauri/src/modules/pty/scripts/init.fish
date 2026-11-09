# lut-shell-integration (fish)
# Emits OSC 7 (cwd) + OSC 133 A/B/C/D so the host tracks cwd and prompt
# boundaries without re-parsing the prompt. fish 4.0+ writes its own OSC 133
# A/B (the `mark-prompt` feature); lut disables it at spawn via
# fish_features=no-mark-prompt so these markers aren't emitted twice.

# Installed into conf.d, which every fish session sources; only lut-spawned
# shells (LUT_TERMINAL=1) may get their prompt wrapped.
if not set -q LUT_TERMINAL
    exit 0
end
if set -q __LUT_HOOKS_LOADED
    exit 0
end
set -g __LUT_HOOKS_LOADED 1

if set -q LUT_CLI; and test -x "$LUT_CLI"
    function lut
        command "$LUT_CLI" $argv
    end
end

# lut is a clean terminal; drop fish's default startup greeting. A user who
# sets their own in config.fish (sourced after this) keeps it.
function fish_greeting
end

set -g __LUT_HOST (uname -n 2>/dev/null; or echo localhost)

# URL-encode a path keeping `/` intact so it stays valid inside file://.
function __lut_urlencode_path
    set -l parts (string split '/' -- $argv[1])
    set -l out
    for p in $parts
        if test -n "$p"
            set out $out (string escape --style=url -- $p)
        else
            set out $out ""
        end
    end
    string join '/' $out
end

function __lut_restore_status
    return $argv[1]
end

function __lut_capture_user_prompt
    if not functions -q fish_prompt
        return
    end
    if functions fish_prompt | string match -q '*__lut_user_prompt*'
        return
    end
    functions -e __lut_user_prompt 2>/dev/null
    functions -c fish_prompt __lut_user_prompt
end

# Wrapped so `fish -C __lut_install_prompt` can re-run it AFTER config.fish,
# where a framework prompt (starship etc.) would otherwise override fish_prompt
# and drop our markers.
function __lut_install_prompt
    # ponytail: cover Conda's named wrapper; generalize if another prompt
    # framework preserves lut indirectly.
    if functions -q __fish_prompt_orig
        and functions fish_prompt | string match -q '*__fish_prompt_orig*'
        and functions __fish_prompt_orig | string match -q '*__lut_user_prompt*'
        return
    end
    __lut_capture_user_prompt
    function fish_prompt
        set -l __lut_status $status
        printf '\e]133;D;%d\e\\' $__lut_status
        printf '\e]7;file://%s%s\e\\' "$__LUT_HOST" (__lut_urlencode_path "$PWD")
        printf '\e]133;A\e\\'
        __lut_restore_status $__lut_status
        if functions -q __lut_user_prompt
            __lut_user_prompt
        else
            printf '%s > ' (prompt_pwd)
        end
        printf '\e]133;B\e\\'
    end
end
__lut_install_prompt

function __lut_preexec --on-event fish_preexec
    set -l cmd (string replace -ra '[\x00-\x1f\x7f]' ' ' -- "$argv")
    printf '\e]133;C;%s\e\\' (string sub -l 256 -- "$cmd")
end
