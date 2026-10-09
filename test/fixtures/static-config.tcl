# Copyright 2026 Yaroslav Mariukha
# SPDX-License-Identifier: MIT

namespace eval ::testcfg {
    variable PRODUCT target_1
    if {[info exists ::PLATFORM_CONFIG]} {
        set PRODUCT [string tolower $::PLATFORM_CONFIG]
    }
}

proc ::testcfg::width {} {
    variable PRODUCT
    if {[string equal $PRODUCT "target_2"]} {
        return 640
    }
    return 1280
}

proc ::testcfg::cvi_params {} {
    return [list CORE_TYPE $::testcfg::PRODUCT MAX_WIDTH [::testcfg::width]]
}
