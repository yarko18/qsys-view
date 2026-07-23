# Copyright 2026 Yaroslav Mariukha
# SPDX-License-Identifier: MIT

package require qsys

proc qv_clean {value} {
    return [string map [list "\\" "\\\\" "\t" "\\t" "\n" "\\n" "\r" "\\r"] $value]
}

foreach instance [get_instances] {
    if {![catch {get_instance_property $instance ENABLED} enabled]} {
        set enabled [string tolower [string trim $enabled]]
        if {[string equal $enabled "false"] || [string equal $enabled "0"]} {
            continue
        }
    }
    foreach interface [get_instance_interfaces $instance] {
        puts "QSYS_VIEWER\tINTERFACE\t[qv_clean $instance]\t[qv_clean $interface]"
        foreach parameter [get_instance_interface_parameters $instance $interface] {
            set value [get_instance_interface_parameter_value $instance $interface $parameter]
            puts "QSYS_VIEWER\tPARAMETER\t[qv_clean $instance]\t[qv_clean $interface]\t[qv_clean $parameter]\t[qv_clean $value]"
        }
        foreach port [get_instance_interface_ports $instance $interface] {
            set role [get_instance_interface_port_property $instance $interface $port ROLE]
            set direction [get_instance_interface_port_property $instance $interface $port DIRECTION]
            set width [get_instance_interface_port_property $instance $interface $port WIDTH]
            puts "QSYS_VIEWER\tPORT\t[qv_clean $instance]\t[qv_clean $interface]\t[qv_clean $port]\t[qv_clean $role]\t[qv_clean $direction]\t[qv_clean $width]"
        }
    }
}
