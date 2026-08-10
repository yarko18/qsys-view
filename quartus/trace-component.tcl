# Copyright 2026 Yaroslav Mariukha
# SPDX-License-Identifier: MIT

set qv_source_path [file normalize [lindex $argv 0]]
set qv_allowed_root [file normalize [lindex $argv 1]]
set qv_override_args [lrange $argv 2 end]

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
    set encoded [binary encode base64 -maxlen 0 [encoding convertto utf-8 [list $command {*}$args]]]
    puts "QSYS_VIEW_TRACE\t$encoded"
    return ""
}

proc qv_file {subcommand args} {
    set allowed {dirname extension join normalize pathtype rootname separator split tail}
    if {[lsearch -exact $allowed $subcommand] < 0} {
        error "unsafe file subcommand '$subcommand' is not available"
    }
    return [file $subcommand {*}$args]
}

proc qv_is_within {path root} {
    set prefix "${root}[file separator]"
    return [expr {$path eq $root || [string first $prefix $path] == 0}]
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
    try {
        return [interp eval $slave [list uplevel #0 $script]]
    } finally {
        interp eval $slave [list set ::qv_active_path $previous]
    }
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

set qv_slave [interp create -safe]
interp alias $qv_slave file {} qv_file
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
    qv_run_callback $qv_slave VALIDATION_CALLBACK
    qv_emit_parameter_values
    if {[qv_run_callback $qv_slave COMPOSITION_CALLBACK]} {
        qv_record qsys_view_component_mode composition
    } elseif {[qv_run_callback $qv_slave ELABORATION_CALLBACK]} {
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
