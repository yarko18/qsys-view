# Copyright 2026 Yaroslav Mariukha
# SPDX-License-Identifier: MIT

# qsys scripting (.tcl) file for platform2
package require -exact qsys 16.0

create_system {platform2}

set_project_property DEVICE_FAMILY {Cyclone V}
set_project_property DEVICE {5CGXFC3B6F23C6}
set_project_property HIDE_FROM_IP_CATALOG {false}

# Instances and instance parameters
# (disabled instances are intentionally culled)
add_instance clipper alt_vip_cl_clp 23.1
set_instance_parameter_value clipper {BITS_PER_SYMBOL} {16}
set_instance_parameter_value clipper {BOTTOM_OFFSET} {0}
set_instance_parameter_value clipper {CLIPPING_METHOD} {OFFSETS}
set_instance_parameter_value clipper {COLOR_PLANES_ARE_IN_PARALLEL} {1}
set_instance_parameter_value clipper {EXTRA_PIPELINING} {0}
set_instance_parameter_value clipper {LEFT_OFFSET} {0}
set_instance_parameter_value clipper {LIMITED_READBACK} {0}
set_instance_parameter_value clipper {MAX_IN_HEIGHT} {720}
set_instance_parameter_value clipper {MAX_IN_WIDTH} {1280}
set_instance_parameter_value clipper {NUMBER_OF_COLOR_PLANES} {1}
set_instance_parameter_value clipper {PIXELS_IN_PARALLEL} {1}
set_instance_parameter_value clipper {RECTANGLE_HEIGHT} {32}
set_instance_parameter_value clipper {RECTANGLE_WIDTH} {32}
set_instance_parameter_value clipper {RIGHT_OFFSET} {0}
set_instance_parameter_value clipper {RUNTIME_CONTROL} {1}
set_instance_parameter_value clipper {TOP_OFFSET} {0}
set_instance_parameter_value clipper {USER_PACKET_FIFO_DEPTH} {0}
set_instance_parameter_value clipper {USER_PACKET_SUPPORT} {PASSTHROUGH}

add_instance clk_memory clock_source 23.1
set_instance_parameter_value clk_memory {clockFrequency} {100000000.0}
set_instance_parameter_value clk_memory {clockFrequencyKnown} {1}
set_instance_parameter_value clk_memory {resetSynchronousEdges} {DEASSERT}

add_instance clk_mono_video clock_source 23.1
set_instance_parameter_value clk_mono_video {clockFrequency} {50000000.0}
set_instance_parameter_value clk_mono_video {clockFrequencyKnown} {1}
set_instance_parameter_value clk_mono_video {resetSynchronousEdges} {DEASSERT}

add_instance fir alt_vip_cl_2dfir 23.1
set_instance_parameter_value fir {ALGORITHM_NAME} {EDGE_ADAPTIVE_SHARPEN}
set_instance_parameter_value fir {BITS_PER_SYMBOL_IN} {16}
set_instance_parameter_value fir {BITS_PER_SYMBOL_OUT} {8}
set_instance_parameter_value fir {COEFF_FRACTION_BITS} {7}
set_instance_parameter_value fir {COEFF_INTEGER_BITS} {1}
set_instance_parameter_value fir {COEFF_SIGNED} {1}
set_instance_parameter_value fir {COLOR_PLANES_ARE_IN_PARALLEL} {1}
set_instance_parameter_value fir {DEFAULT_LOWER_BLUR} {0}
set_instance_parameter_value fir {DEFAULT_UPPER_BLUR} {15}
set_instance_parameter_value fir {DIAG_SYMMETRIC} {0}
set_instance_parameter_value fir {DO_MIRRORING} {1}
set_instance_parameter_value fir {ENABLE_WIDE_BLUR_SHARPEN} {1}
set_instance_parameter_value fir {EXTRA_PIPELINING} {0}
set_instance_parameter_value fir {FIXED_COEFF_FILE} {<enter file name (including full path)>}
set_instance_parameter_value fir {H_SYMMETRIC} {0}
set_instance_parameter_value fir {H_TAPS} {8}
set_instance_parameter_value fir {INPUT_GUARD_BANDS_ENABLE} {0}
set_instance_parameter_value fir {INPUT_GUARD_BAND_LOWER} {0}
set_instance_parameter_value fir {INPUT_GUARD_BAND_UPPER} {255}
set_instance_parameter_value fir {IS_422} {0}
set_instance_parameter_value fir {LIMITED_READBACK} {0}
set_instance_parameter_value fir {MAX_HEIGHT} {720}
set_instance_parameter_value fir {MAX_WIDTH} {1280}
set_instance_parameter_value fir {MOVE_BINARY_POINT_RIGHT} {0}
set_instance_parameter_value fir {NO_BLANKING} {0}
set_instance_parameter_value fir {NUMBER_OF_COLOR_PLANES} {1}
set_instance_parameter_value fir {OUTPUT_GUARD_BANDS_ENABLE} {0}
set_instance_parameter_value fir {OUTPUT_GUARD_BAND_LOWER} {0}
set_instance_parameter_value fir {OUTPUT_GUARD_BAND_UPPER} {255}
set_instance_parameter_value fir {PIXELS_IN_PARALLEL} {1}
set_instance_parameter_value fir {ROUNDING_METHOD} {ROUND_HALF_UP}
set_instance_parameter_value fir {RUNTIME_CONTROL} {0}
set_instance_parameter_value fir {USER_PACKET_SUPPORT} {PASSTHROUGH}
set_instance_parameter_value fir {V_SYMMETRIC} {0}
set_instance_parameter_value fir {V_TAPS} {8}

add_instance frame_buffer_mono alt_vip_cl_vfb 23.1
set_instance_parameter_value frame_buffer_mono {BITS_PER_SYMBOL} {16}
set_instance_parameter_value frame_buffer_mono {BURST_ALIGNMENT} {1}
set_instance_parameter_value frame_buffer_mono {CLOCKS_ARE_SEPARATE} {1}
set_instance_parameter_value frame_buffer_mono {COLOR_PLANES_ARE_IN_PARALLEL} {1}
set_instance_parameter_value frame_buffer_mono {CONTROLLED_DROP_REPEAT} {0}
set_instance_parameter_value frame_buffer_mono {DROP_FRAMES} {1}
set_instance_parameter_value frame_buffer_mono {DROP_INVALID_FIELDS} {0}
set_instance_parameter_value frame_buffer_mono {DROP_REPEAT_USER} {0}
set_instance_parameter_value frame_buffer_mono {INTERLACED_SUPPORT} {0}
set_instance_parameter_value frame_buffer_mono {IS_FRAME_READER} {0}
set_instance_parameter_value frame_buffer_mono {IS_FRAME_WRITER} {0}
set_instance_parameter_value frame_buffer_mono {IS_SYNC_MASTER} {0}
set_instance_parameter_value frame_buffer_mono {IS_SYNC_SLAVE} {0}
set_instance_parameter_value frame_buffer_mono {LINE_BASED_BUFFERING} {0}
set_instance_parameter_value frame_buffer_mono {MAX_HEIGHT} {720}
set_instance_parameter_value frame_buffer_mono {MAX_SYMBOLS_PER_PACKET} {10}
set_instance_parameter_value frame_buffer_mono {MAX_WIDTH} {1280}
set_instance_parameter_value frame_buffer_mono {MEM_BASE_ADDR} {0}
set_instance_parameter_value frame_buffer_mono {MEM_BUFFER_OFFSET} {16777216}
set_instance_parameter_value frame_buffer_mono {MEM_PORT_WIDTH} {256}
set_instance_parameter_value frame_buffer_mono {MULTI_FRAME_DELAY} {1}
set_instance_parameter_value frame_buffer_mono {NUMBER_OF_COLOR_PLANES} {1}
set_instance_parameter_value frame_buffer_mono {PIXELS_IN_PARALLEL} {1}
set_instance_parameter_value frame_buffer_mono {PRIORITIZE_FMAX} {0}
set_instance_parameter_value frame_buffer_mono {READER_RUNTIME_CONTROL} {0}
set_instance_parameter_value frame_buffer_mono {READY_LATENCY} {1}
set_instance_parameter_value frame_buffer_mono {READ_BURST_TARGET} {32}
set_instance_parameter_value frame_buffer_mono {READ_FIFO_DEPTH} {64}
set_instance_parameter_value frame_buffer_mono {REPEAT_FRAMES} {1}
set_instance_parameter_value frame_buffer_mono {TEST_INIT} {0}
set_instance_parameter_value frame_buffer_mono {USER_PACKETS_MAX_STORAGE} {0}
set_instance_parameter_value frame_buffer_mono {USE_BUFFER_OFFSET} {0}
set_instance_parameter_value frame_buffer_mono {WRITER_RUNTIME_CONTROL} {0}
set_instance_parameter_value frame_buffer_mono {WRITE_BURST_TARGET} {32}
set_instance_parameter_value frame_buffer_mono {WRITE_FIFO_DEPTH} {64}

add_instance mm_bridge altera_avalon_mm_bridge 23.1
set_instance_parameter_value mm_bridge {ADDRESS_UNITS} {WORDS}
set_instance_parameter_value mm_bridge {ADDRESS_WIDTH} {10}
set_instance_parameter_value mm_bridge {DATA_WIDTH} {32}
set_instance_parameter_value mm_bridge {LINEWRAPBURSTS} {0}
set_instance_parameter_value mm_bridge {MAX_BURST_SIZE} {1}
set_instance_parameter_value mm_bridge {MAX_PENDING_RESPONSES} {4}
set_instance_parameter_value mm_bridge {PIPELINE_COMMAND} {1}
set_instance_parameter_value mm_bridge {PIPELINE_RESPONSE} {1}
set_instance_parameter_value mm_bridge {SYMBOL_WIDTH} {8}
set_instance_parameter_value mm_bridge {USE_AUTO_ADDRESS_WIDTH} {1}
set_instance_parameter_value mm_bridge {USE_RESPONSE} {0}

add_instance sc_fifo_0 altera_avalon_sc_fifo 23.1
set_instance_parameter_value sc_fifo_0 {BITS_PER_SYMBOL} {16}
set_instance_parameter_value sc_fifo_0 {CHANNEL_WIDTH} {0}
set_instance_parameter_value sc_fifo_0 {EMPTY_LATENCY} {3}
set_instance_parameter_value sc_fifo_0 {ENABLE_EXPLICIT_MAXCHANNEL} {0}
set_instance_parameter_value sc_fifo_0 {ERROR_WIDTH} {0}
set_instance_parameter_value sc_fifo_0 {EXPLICIT_MAXCHANNEL} {0}
set_instance_parameter_value sc_fifo_0 {FIFO_DEPTH} {16}
set_instance_parameter_value sc_fifo_0 {SYMBOLS_PER_BEAT} {1}
set_instance_parameter_value sc_fifo_0 {USE_ALMOST_EMPTY_IF} {0}
set_instance_parameter_value sc_fifo_0 {USE_ALMOST_FULL_IF} {0}
set_instance_parameter_value sc_fifo_0 {USE_FILL_LEVEL} {0}
set_instance_parameter_value sc_fifo_0 {USE_MEMORY_BLOCKS} {1}
set_instance_parameter_value sc_fifo_0 {USE_PACKETS} {1}
set_instance_parameter_value sc_fifo_0 {USE_STORE_FORWARD} {0}

add_instance scaler alt_vip_cl_scl 23.1
set_instance_parameter_value scaler {ALGORITHM_NAME} {BICUBIC}
set_instance_parameter_value scaler {ALWAYS_DOWNSCALE} {0}
set_instance_parameter_value scaler {ARE_IDENTICAL} {0}
set_instance_parameter_value scaler {BITS_PER_SYMBOL} {16}
set_instance_parameter_value scaler {DEFAULT_EDGE_THRESH} {7}
set_instance_parameter_value scaler {DEFAULT_LOWER_BLUR} {0}
set_instance_parameter_value scaler {DEFAULT_UPPER_BLUR} {0}
set_instance_parameter_value scaler {ENABLE_FIR} {0}
set_instance_parameter_value scaler {EXTRA_PIPELINING} {1}
set_instance_parameter_value scaler {H_BANKS} {1}
set_instance_parameter_value scaler {H_COEFF_FILE} {<enter file name (including full path)>}
set_instance_parameter_value scaler {H_FRACTION_BITS} {7}
set_instance_parameter_value scaler {H_FUNCTION} {LANCZOS_2}
set_instance_parameter_value scaler {H_INTEGER_BITS} {1}
set_instance_parameter_value scaler {H_PHASES} {16}
set_instance_parameter_value scaler {H_SIGNED} {1}
set_instance_parameter_value scaler {H_SYMMETRIC} {0}
set_instance_parameter_value scaler {H_TAPS} {8}
set_instance_parameter_value scaler {IS_420} {0}
set_instance_parameter_value scaler {IS_422} {0}
set_instance_parameter_value scaler {LIMITED_READBACK} {0}
set_instance_parameter_value scaler {LOAD_AT_RUNTIME} {0}
set_instance_parameter_value scaler {MAX_IN_HEIGHT} {720}
set_instance_parameter_value scaler {MAX_IN_WIDTH} {1280}
set_instance_parameter_value scaler {MAX_OUT_HEIGHT} {1080}
set_instance_parameter_value scaler {MAX_OUT_WIDTH} {1920}
set_instance_parameter_value scaler {NO_BLANKING} {0}
set_instance_parameter_value scaler {PIXELS_IN_PARALLEL} {1}
set_instance_parameter_value scaler {PRESERVE_BITS} {0}
set_instance_parameter_value scaler {RUNTIME_CONTROL} {0}
set_instance_parameter_value scaler {SYMBOLS_IN_PAR} {1}
set_instance_parameter_value scaler {SYMBOLS_IN_SEQ} {1}
set_instance_parameter_value scaler {USER_PACKET_FIFO_DEPTH} {0}
set_instance_parameter_value scaler {USER_PACKET_SUPPORT} {PASSTHROUGH}
set_instance_parameter_value scaler {V_BANKS} {1}
set_instance_parameter_value scaler {V_COEFF_FILE} {<enter file name (including full path)>}
set_instance_parameter_value scaler {V_FRACTION_BITS} {7}
set_instance_parameter_value scaler {V_FUNCTION} {LANCZOS_2}
set_instance_parameter_value scaler {V_INTEGER_BITS} {1}
set_instance_parameter_value scaler {V_PHASES} {16}
set_instance_parameter_value scaler {V_SIGNED} {1}
set_instance_parameter_value scaler {V_SYMMETRIC} {0}
set_instance_parameter_value scaler {V_TAPS} {8}

# exported interfaces
add_interface clk_memory clock sink
set_interface_property clk_memory EXPORT_OF clk_memory.clk_in
add_interface clk_mono_video clock sink
set_interface_property clk_mono_video EXPORT_OF clk_mono_video.clk_in
add_interface din avalon_streaming sink
set_interface_property din EXPORT_OF sc_fifo_0.in
add_interface dout avalon_streaming source
set_interface_property dout EXPORT_OF scaler.dout
add_interface frame_buffer_mono_mem_master_rd avalon master
set_interface_property frame_buffer_mono_mem_master_rd EXPORT_OF frame_buffer_mono.mem_master_rd
add_interface frame_buffer_mono_mem_master_wr avalon master
set_interface_property frame_buffer_mono_mem_master_wr EXPORT_OF frame_buffer_mono.mem_master_wr
add_interface mm_bridge_s avalon slave
set_interface_property mm_bridge_s EXPORT_OF mm_bridge.s0
add_interface reset_memory reset sink
set_interface_property reset_memory EXPORT_OF clk_memory.clk_in_reset
add_interface reset_mono_video reset sink
set_interface_property reset_mono_video EXPORT_OF clk_mono_video.clk_in_reset

# connections and connection parameters
add_connection clipper.dout frame_buffer_mono.din

add_connection clk_memory.clk frame_buffer_mono.mem_clock

add_connection clk_memory.clk_reset frame_buffer_mono.mem_reset

add_connection clk_mono_video.clk clipper.main_clock

add_connection clk_mono_video.clk fir.main_clock

add_connection clk_mono_video.clk frame_buffer_mono.main_clock

add_connection clk_mono_video.clk mm_bridge.clk

add_connection clk_mono_video.clk sc_fifo_0.clk

add_connection clk_mono_video.clk scaler.main_clock

add_connection clk_mono_video.clk_reset clipper.main_reset

add_connection clk_mono_video.clk_reset fir.main_reset

add_connection clk_mono_video.clk_reset frame_buffer_mono.main_reset

add_connection clk_mono_video.clk_reset mm_bridge.reset

add_connection clk_mono_video.clk_reset sc_fifo_0.clk_reset

add_connection clk_mono_video.clk_reset scaler.main_reset

add_connection fir.dout clipper.din

add_connection frame_buffer_mono.dout scaler.din

add_connection mm_bridge.m0 clipper.control
set_connection_parameter_value mm_bridge.m0/clipper.control arbitrationPriority {1}
set_connection_parameter_value mm_bridge.m0/clipper.control baseAddress {0x00080400}
set_connection_parameter_value mm_bridge.m0/clipper.control defaultConnection {0}

add_connection sc_fifo_0.out fir.din

# interconnect requirements
set_interconnect_requirement {$system} {qsys_mm.clockCrossingAdapter} {HANDSHAKE}
set_interconnect_requirement {$system} {qsys_mm.enableEccProtection} {FALSE}
set_interconnect_requirement {$system} {qsys_mm.insertDefaultSlave} {FALSE}
set_interconnect_requirement {$system} {qsys_mm.maxAdditionalLatency} {1}

save_system {platform2.qsys}
