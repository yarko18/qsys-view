# Copyright 2026 Yaroslav Mariukha
# SPDX-License-Identifier: MIT

set qv_source_path [file normalize [lindex $argv 0]]
set qv_allowed_root [file normalize [lindex $argv 1]]
set qv_variable_args [lrange $argv 2 end]

source [file join [file dirname [info script]] safe-common.tcl]

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
    set code [catch {interp eval $slave [list uplevel #0 $script]} result options]
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
    error "package $subcommand is not available in the safe Qsys viewer"
}

set qv_slave [interp create -safe]
interp alias $qv_slave file {} qv_file
interp alias $qv_slave qv_source {} qv_source $qv_slave $qv_allowed_root
interp alias $qv_slave package {} qv_package
interp alias $qv_slave qv_record {} qv_record
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
foreach {name value} $qv_variable_args {
    interp eval $qv_slave [list set $name $value]
}

set qv_script [read stdin]
if {[catch {interp eval $qv_slave $qv_script} qv_error qv_options]} {
    puts stderr $qv_error
    if {[dict exists $qv_options -errorinfo]} {
        puts stderr [dict get $qv_options -errorinfo]
    }
    exit 1
}
interp delete $qv_slave
