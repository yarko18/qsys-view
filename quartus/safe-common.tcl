# Copyright 2026 Yaroslav Mariukha
# SPDX-License-Identifier: MIT

# Shared helpers for the restricted system and component Tcl interpreters.

proc qv_file {subcommand args} {
    set allowed {dirname extension join normalize pathtype rootname separator split tail}
    if {[lsearch -exact $allowed $subcommand] < 0} {
        error "unsafe file subcommand '$subcommand' is not available"
    }
    return [file $subcommand {*}$args]
}

# Compares paths that have already been normalized by Tcl. Keeping the string
# comparison separate makes the Windows separator and case rules testable on
# every host platform.
proc qv_normalized_path_is_within {path root platform} {
    set path [string map {\\ /} $path]
    set root [string trimright [string map {\\ /} $root] /]
    if {$platform eq "windows"} {
        set path [string tolower $path]
        set root [string tolower $root]
    }
    return [expr {$path eq $root || [string first "${root}/" $path] == 0}]
}

proc qv_is_within {path root} {
    return [qv_normalized_path_is_within \
        [file normalize $path] \
        [file normalize $root] \
        $::tcl_platform(platform)]
}

# Tcl 8.6 added `binary encode base64`; Quartus and macOS installations can
# still provide Tcl 8.5, so tracing uses this small compatible encoder.
proc qv_base64_encode {data} {
    binary scan $data c* bytes
    set alphabet {ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/}
    set output {}
    set length [llength $bytes]
    for {set index 0} {$index < $length} {incr index 3} {
        set b0 [expr {[lindex $bytes $index] & 0xff}]
        set b1 [expr {$index + 1 < $length ? ([lindex $bytes [expr {$index + 1}]] & 0xff) : 0}]
        set b2 [expr {$index + 2 < $length ? ([lindex $bytes [expr {$index + 2}]] & 0xff) : 0}]
        set packed [expr {($b0 << 16) | ($b1 << 8) | $b2}]
        append output \
            [string index $alphabet [expr {($packed >> 18) & 0x3f}]] \
            [string index $alphabet [expr {($packed >> 12) & 0x3f}]] \
            [expr {$index + 1 < $length ? [string index $alphabet [expr {($packed >> 6) & 0x3f}]] : "="}] \
            [expr {$index + 2 < $length ? [string index $alphabet [expr {$packed & 0x3f}]] : "="}]
    }
    return $output
}
