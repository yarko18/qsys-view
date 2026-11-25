# Copyright 2026 Yaroslav Mariukha
# SPDX-License-Identifier: MIT

set qv_source_path [file normalize [lindex $argv 0]]
set qv_allowed_root [file normalize [lindex $argv 1]]
set qv_override_args [lrange $argv 2 end]

source [file join [file dirname [info script]] safe-common.tcl]

array set qv_overrides {}
foreach {name value} $qv_override_args {
    set qv_overrides([string trimleft $name :]) $value
}
array set qv_parameter_types {}
array set qv_parameter_defaults {}
array set qv_parameter_values {}
array set qv_parameter_properties {}
array set qv_module_properties {}

proc qv_record {command args} {
    set encoded [qv_base64_encode [encoding convertto utf-8 [list $command {*}$args]]]
    puts "QSYS_VIEW_TRACE\t$encoded"
    return ""
}

proc qv_source {slave allowed_root current requested} {
    if {[file pathtype $requested] eq "relative"} {
        set base [expr {$current eq "" ? $allowed_root : [file dirname $current]}]
        set requested [file join $base $requested]
    }
    set resolved [file normalize $requested]
    if {![qv_is_within $resolved $allowed_root]} {
        error "source outside the workspace is not allowed: $resolved"
    }
    set channel [open $resolved r]
    set script [read $channel]
    close $channel
    set previous [interp eval $slave {set ::qv_active_path}]
    interp eval $slave [list set ::qv_active_path $resolved]
    set code [catch {
        set source_result [interp eval $slave [list uplevel #0 $script]]
        interp eval $slave [list qv_install_file_traces $resolved $script]
        set source_result
    } result options]
    set restore_code [catch {
        interp eval $slave [list set ::qv_active_path $previous]
    } restore_result restore_options]
    if {$code} {
        return -options $options $result
    }
    if {$restore_code} {
        return -options $restore_options $restore_result
    }
    return $result
}

proc qv_package {subcommand args} {
    if {$subcommand eq "require" && [lsearch -exact $args qsys] >= 0} {
        return [lindex $args end]
    }
    error "package $subcommand is not available in the safe Qsys component viewer"
}

proc qv_add_parameter {name type args} {
    global qv_overrides qv_parameter_types qv_parameter_defaults qv_parameter_values
    set default_value [expr {[llength $args] > 0 ? [lindex $args 0] : ""}]
    set qv_parameter_types($name) $type
    set qv_parameter_defaults($name) $default_value
    set qv_parameter_values($name) $default_value
    if {[info exists qv_overrides($name)]} {
        set qv_parameter_values($name) $qv_overrides($name)
    }
    qv_record add_parameter $name $type $default_value
    return ""
}

proc qv_set_parameter_property {name property value args} {
    global qv_overrides qv_parameter_defaults qv_parameter_values qv_parameter_properties
    set normalized [string toupper $property]
    set qv_parameter_properties($name,$normalized) $value
    if {$normalized eq "DEFAULT_VALUE"} {
        set qv_parameter_defaults($name) $value
        if {![info exists qv_overrides($name)]} {
            set qv_parameter_values($name) $value
        }
    }
    qv_record set_parameter_property $name $property $value {*}$args
    return ""
}

proc qv_get_parameter_property {name property} {
    global qv_parameter_types qv_parameter_defaults qv_parameter_values qv_parameter_properties
    set normalized [string toupper $property]
    if {$normalized eq "TYPE" && [info exists qv_parameter_types($name)]} {
        return $qv_parameter_types($name)
    }
    if {$normalized eq "DEFAULT_VALUE" && [info exists qv_parameter_defaults($name)]} {
        return $qv_parameter_defaults($name)
    }
    if {$normalized eq "VALUE" && [info exists qv_parameter_values($name)]} {
        return $qv_parameter_values($name)
    }
    if {[info exists qv_parameter_properties($name,$normalized)]} {
        return $qv_parameter_properties($name,$normalized)
    }
    return ""
}

proc qv_get_parameter_value {name} {
    global qv_parameter_values
    if {[info exists qv_parameter_values($name)]} {
        return $qv_parameter_values($name)
    }
    return ""
}

proc qv_set_parameter_value {name value} {
    global qv_parameter_values
    set qv_parameter_values($name) $value
    qv_record set_parameter_value $name $value
    return ""
}

proc qv_get_parameters {} {
    global qv_parameter_values
    return [lsort [array names qv_parameter_values]]
}

proc qv_set_module_property {property value args} {
    global qv_module_properties
    set qv_module_properties([string toupper $property]) $value
    qv_record set_module_property $property $value {*}$args
    return ""
}

proc qv_get_module_property {property} {
    global qv_module_properties
    set normalized [string toupper $property]
    if {[info exists qv_module_properties($normalized)]} {
        return $qv_module_properties($normalized)
    }
    return ""
}

proc qv_add_display_item {args} {
    qv_record add_display_item {*}$args
    return ""
}

proc qv_emit_parameter_values {} {
    global qv_parameter_values
    foreach name [lsort [array names qv_parameter_values]] {
        qv_record qsys_view_component_value $name $qv_parameter_values($name)
    }
}

proc qv_run_callback {slave property} {
    global qv_module_properties
    if {![info exists qv_module_properties($property)] || $qv_module_properties($property) eq ""} {
        return 0
    }
    interp eval $slave [list $qv_module_properties($property)]
    return 1
}

proc qv_run_callback_safe {slave property} {
    global qv_module_properties
    if {![info exists qv_module_properties($property)] || $qv_module_properties($property) eq ""} {
        return 0
    }
    if {[catch {interp eval $slave [list $qv_module_properties($property)]} callback_error]} {
        qv_record qsys_view_component_callback_error $property $callback_error
    }
    return 1
}

set qv_slave [interp create -safe]
interp alias $qv_slave file {} qv_file $qv_allowed_root
interp alias $qv_slave qv_source {} qv_source $qv_slave $qv_allowed_root
interp alias $qv_slave package {} qv_package
interp alias $qv_slave qv_record {} qv_record
interp alias $qv_slave add_parameter {} qv_add_parameter
interp alias $qv_slave set_parameter_property {} qv_set_parameter_property
interp alias $qv_slave get_parameter_property {} qv_get_parameter_property
interp alias $qv_slave get_parameter_value {} qv_get_parameter_value
interp alias $qv_slave set_parameter_value {} qv_set_parameter_value
interp alias $qv_slave get_parameters {} qv_get_parameters
interp alias $qv_slave set_module_property {} qv_set_module_property
interp alias $qv_slave get_module_property {} qv_get_module_property
interp alias $qv_slave add_display_item {} qv_add_display_item
interp eval $qv_slave {
    array set qv_file_trace_callbacks {}

    proc qv_file_registration_trace {origin command operation} {
        set stack {}
        # Execution traces run immediately before the registered procedure.
        # Levels 1..N-1 therefore contain the semantic helper chain, from the
        # outer component call to the innermost wrapper.
        for {set level 1} {$level < [qv_info_core level]} {incr level} {
            set frame [qv_info_core level $level]
            if {[llength $frame] > 0} {
                lappend stack [lindex $frame 0]
            }
        }
        qv_record qsys_view_component_file_registration $origin $command $stack
    }

    proc qv_install_file_traces {origin script} {
        variable qv_file_trace_callbacks
        foreach command [qv_info_core procs] {
            set tail [namespace tail $command]
            if {![regexp {^add_(?:static_[[:alnum:]_]+_file|(?:c|cpp|h|hpp)_file)$} $tail]} {
                continue
            }
            # Do not attribute an older primitive to every subsequently
            # sourced helper file. Only the Tcl file that defines/redefines
            # this procedure owns its registration trace.
            set definition_pattern [format {^[ \t]*proc[ \t]+(?:::)?%s[ \t]} $tail]
            if {![regexp -line -- $definition_pattern $script]} {
                continue
            }
            if {[qv_info_core exists qv_file_trace_callbacks($command)]} {
                catch {trace remove execution $command enter $qv_file_trace_callbacks($command)}
            }
            set callback [list qv_file_registration_trace $origin]
            trace add execution $command enter $callback
            set qv_file_trace_callbacks($command) $callback
        }
    }

    rename info qv_info_core
    proc info {subcommand args} {
        if {$subcommand eq "script" && [qv_info_core script] eq ""} {
            return $::qv_active_path
        }
        return [uplevel 1 [list qv_info_core $subcommand {*}$args]]
    }
    proc source {requested} {
        set current [qv_info_core script]
        if {$current eq ""} {
            set current $::qv_active_path
        }
        return [qv_source $current $requested]
    }
    proc unknown {command args} {
        if {[regexp {^(add|apply|auto|create|delete|disable|duplicate|enable|export|get|is|load|lock|remove|save|send|set|sync|unlock|validate)_} $command]} {
            return [qv_record $command {*}$args]
        }
        return -code error "invalid command name \"$command\""
    }
}
interp eval $qv_slave [list set ::qv_entry_path $qv_source_path]
interp eval $qv_slave [list set ::qv_active_path $qv_source_path]

set qv_script [read stdin]
if {[catch {
    interp eval $qv_slave $qv_script
    qv_run_callback_safe $qv_slave VALIDATION_CALLBACK
    qv_emit_parameter_values
    if {[qv_run_callback_safe $qv_slave COMPOSITION_CALLBACK]} {
        qv_record qsys_view_component_mode composition
    } elseif {[qv_run_callback_safe $qv_slave ELABORATION_CALLBACK]} {
        qv_record qsys_view_component_mode leaf
    } else {
        qv_record qsys_view_component_mode leaf
    }
    qv_emit_parameter_values
} qv_error qv_options]} {
    puts stderr $qv_error
    if {[dict exists $qv_options -errorinfo]} {
        puts stderr [dict get $qv_options -errorinfo]
    }
    exit 1
}
interp delete $qv_slave
