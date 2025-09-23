#!/usr/bin/env bash

# Carrier CLI autocomplete script
# Installation:
#   For bash: Add to ~/.bashrc
#     source /path/to/carrier/scripts/autocomplete.sh
#   For zsh: Add to ~/.zshrc
#     source /path/to/carrier/scripts/autocomplete.sh

_carrier_completions() {
    local cur prev opts
    COMPREPLY=()
    cur="${COMP_WORDS[COMP_CWORD]}"
    prev="${COMP_WORDS[COMP_CWORD-1]}"

    # Main commands
    local commands="deploy approve status monitor ls pull rm init config help"
    
    # Command-specific options
    local init_opts="--global --no-claude"
    local ls_opts="--remote -r"
    local help_opts="deploy approve status monitor ls pull rm init config"
    
    case "${prev}" in
        carrier)
            COMPREPLY=( $(compgen -W "${commands}" -- ${cur}) )
            return 0
            ;;
        init)
            COMPREPLY=( $(compgen -W "${init_opts}" -- ${cur}) )
            return 0
            ;;
        ls|list)
            COMPREPLY=( $(compgen -W "${ls_opts}" -- ${cur}) )
            return 0
            ;;
        help|-h|--help)
            COMPREPLY=( $(compgen -W "${help_opts}" -- ${cur}) )
            return 0
            ;;
        deploy)
            # List available fleets
            if [ -d ".carrier/fleets" ]; then
                local fleets=$(ls -d .carrier/fleets/*/ 2>/dev/null | xargs -n 1 basename 2>/dev/null)
                COMPREPLY=( $(compgen -W "${fleets}" -- ${cur}) )
            fi
            return 0
            ;;
        approve|status|monitor)
            # List deployed fleet IDs
            if [ -f ".carrier/deployed/registry.json" ]; then
                local fleet_ids=$(grep '"id"' .carrier/deployed/registry.json | cut -d'"' -f4)
                COMPREPLY=( $(compgen -W "${fleet_ids}" -- ${cur}) )
            fi
            return 0
            ;;
        pull)
            # List remote fleets if carrier-sh repo exists
            if [ -d "$HOME/Workspace/carrier-sh/fleets" ]; then
                local remote_fleets=$(ls -d $HOME/Workspace/carrier-sh/fleets/*/ 2>/dev/null | xargs -n 1 basename 2>/dev/null)
                COMPREPLY=( $(compgen -W "${remote_fleets}" -- ${cur}) )
            fi
            return 0
            ;;
        rm|remove)
            # List installed fleets
            if [ -d ".carrier/fleets" ]; then
                local installed_fleets=$(ls -d .carrier/fleets/*/ 2>/dev/null | xargs -n 1 basename 2>/dev/null)
                COMPREPLY=( $(compgen -W "${installed_fleets}" -- ${cur}) )
            fi
            return 0
            ;;
    esac

    # Handle flags starting with -
    if [[ ${cur} == -* ]]; then
        case "${COMP_WORDS[1]}" in
            init)
                COMPREPLY=( $(compgen -W "${init_opts}" -- ${cur}) )
                ;;
            ls)
                COMPREPLY=( $(compgen -W "${ls_opts}" -- ${cur}) )
                ;;
            *)
                COMPREPLY=( $(compgen -W "--help -h" -- ${cur}) )
                ;;
        esac
        return 0
    fi

    # Default to command completion if we're still at position 1
    if [ "${COMP_CWORD}" -eq 1 ]; then
        COMPREPLY=( $(compgen -W "${commands}" -- ${cur}) )
    fi
}

# Bash completion
if [ -n "$BASH_VERSION" ]; then
    complete -F _carrier_completions carrier
fi

# Zsh completion
if [ -n "$ZSH_VERSION" ]; then
    autoload -U +X compinit && compinit
    autoload -U +X bashcompinit && bashcompinit
    complete -F _carrier_completions carrier
fi