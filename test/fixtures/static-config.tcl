# Copyright 2026 Yaroslav Mariukha
# SPDX-License-Identifier: MIT

namespace eval ::testcfg {
    variable PRODUCT WHC
    if {[info exists ::PLATFORM_CONFIG]} {
        set PRODUCT [string toupper $::PLATFORM_CONFIG]
    }
}

proc ::testcfg::width {} {
    variable PRODUCT
    if {[string equal $PRODUCT "WTC"]} {
        return 640
    }
    return 1280
}

proc ::testcfg::cvi_params {} {
    return [list CORE_TYPE $::testcfg::PRODUCT MAX_WIDTH [::testcfg::width]]
}
