# Copyright 2026 Yaroslav Mariukha
# SPDX-License-Identifier: MIT

# qsys scripting (.tcl) file for platform
package require -exact qsys 16.0

create_system {platform}

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

add_instance cvi_color alt_vip_cl_cvi 23.1
set_instance_parameter_value cvi_color {ACCEPT_COLOURS_IN_SEQ} {0}
set_instance_parameter_value cvi_color {ANC_DEPTH} {1}
set_instance_parameter_value cvi_color {BPS} {8}
set_instance_parameter_value cvi_color {CLOCKS_ARE_SAME} {0}
set_instance_parameter_value cvi_color {COLOUR_PLANES_ARE_IN_PARALLEL} {1}
set_instance_parameter_value cvi_color {EXTRACT_TOTAL_RESOLUTION} {1}
set_instance_parameter_value cvi_color {FIFO_DEPTH} {2048}
set_instance_parameter_value cvi_color {GENERATE_ANC} {0}
set_instance_parameter_value cvi_color {GENERATE_VID_F} {0}
set_instance_parameter_value cvi_color {H_ACTIVE_PIXELS_F0} {1920}
set_instance_parameter_value cvi_color {INTERLACED} {0}
set_instance_parameter_value cvi_color {MATCH_CTRLDATA_PKT_CLIP_BASIC} {0}
set_instance_parameter_value cvi_color {MATCH_CTRLDATA_PKT_PAD_ADV} {0}
set_instance_parameter_value cvi_color {NO_OF_CHANNELS} {1}
set_instance_parameter_value cvi_color {NUMBER_OF_COLOUR_PLANES} {3}
set_instance_parameter_value cvi_color {OVERFLOW_HANDLING} {1}
set_instance_parameter_value cvi_color {PIXELS_IN_PARALLEL} {1}
set_instance_parameter_value cvi_color {STD_WIDTH} {1}
set_instance_parameter_value cvi_color {SYNC_TO} {0}
set_instance_parameter_value cvi_color {USE_CONTROL} {1}
set_instance_parameter_value cvi_color {USE_EMBEDDED_SYNCS} {0}
set_instance_parameter_value cvi_color {USE_HDMI_DEPRICATION} {0}
set_instance_parameter_value cvi_color {USE_STD} {0}
set_instance_parameter_value cvi_color {V_ACTIVE_LINES_F0} {1080}
set_instance_parameter_value cvi_color {V_ACTIVE_LINES_F1} {480}

add_instance cvi_mono alt_vip_cl_cvi 23.1
set_instance_parameter_value cvi_mono {ACCEPT_COLOURS_IN_SEQ} {0}
set_instance_parameter_value cvi_mono {ANC_DEPTH} {1}
set_instance_parameter_value cvi_mono {BPS} {16}
set_instance_parameter_value cvi_mono {CLOCKS_ARE_SAME} {1}
set_instance_parameter_value cvi_mono {COLOUR_PLANES_ARE_IN_PARALLEL} {1}
set_instance_parameter_value cvi_mono {EXTRACT_TOTAL_RESOLUTION} {1}
set_instance_parameter_value cvi_mono {FIFO_DEPTH} {2048}
set_instance_parameter_value cvi_mono {GENERATE_ANC} {0}
set_instance_parameter_value cvi_mono {GENERATE_VID_F} {0}
set_instance_parameter_value cvi_mono {H_ACTIVE_PIXELS_F0} {1280}
set_instance_parameter_value cvi_mono {INTERLACED} {0}
set_instance_parameter_value cvi_mono {MATCH_CTRLDATA_PKT_CLIP_BASIC} {0}
set_instance_parameter_value cvi_mono {MATCH_CTRLDATA_PKT_PAD_ADV} {0}
set_instance_parameter_value cvi_mono {NO_OF_CHANNELS} {1}
set_instance_parameter_value cvi_mono {NUMBER_OF_COLOUR_PLANES} {1}
set_instance_parameter_value cvi_mono {OVERFLOW_HANDLING} {1}
set_instance_parameter_value cvi_mono {PIXELS_IN_PARALLEL} {1}
set_instance_parameter_value cvi_mono {STD_WIDTH} {1}
set_instance_parameter_value cvi_mono {SYNC_TO} {0}
set_instance_parameter_value cvi_mono {USE_CONTROL} {1}
set_instance_parameter_value cvi_mono {USE_EMBEDDED_SYNCS} {0}
set_instance_parameter_value cvi_mono {USE_HDMI_DEPRICATION} {0}
set_instance_parameter_value cvi_mono {USE_STD} {0}
set_instance_parameter_value cvi_mono {V_ACTIVE_LINES_F0} {720}
set_instance_parameter_value cvi_mono {V_ACTIVE_LINES_F1} {480}

add_instance cvo alt_vip_cl_cvo 23.1
set_instance_parameter_value cvo {ACCEPT_COLOURS_IN_SEQ} {0}
set_instance_parameter_value cvo {ACCEPT_SYNC} {0}
set_instance_parameter_value cvo {ANC_LINE} {9}
set_instance_parameter_value cvo {AP_LINE} {21}
set_instance_parameter_value cvo {BPS} {8}
set_instance_parameter_value cvo {CLOCKS_ARE_SAME} {0}
set_instance_parameter_value cvo {COLOUR_PLANES_ARE_IN_PARALLEL} {1}
set_instance_parameter_value cvo {CONTEXT_WIDTH} {8}
set_instance_parameter_value cvo {COUNT_STEP_IS_PIP_VALUE} {0}
set_instance_parameter_value cvo {DST_WIDTH} {8}
set_instance_parameter_value cvo {FIELD0_ANC_LINE} {571}
set_instance_parameter_value cvo {FIELD0_V_BACK_PORCH} {0}
set_instance_parameter_value cvo {FIELD0_V_BLANK} {23}
set_instance_parameter_value cvo {FIELD0_V_FRONT_PORCH} {0}
set_instance_parameter_value cvo {FIELD0_V_RISING_EDGE} {561}
set_instance_parameter_value cvo {FIELD0_V_SYNC_LENGTH} {0}
set_instance_parameter_value cvo {FIFO_DEPTH} {1920}
set_instance_parameter_value cvo {F_FALLING_EDGE} {1}
set_instance_parameter_value cvo {F_RISING_EDGE} {564}
set_instance_parameter_value cvo {GENERATE_SYNC} {0}
set_instance_parameter_value cvo {H_ACTIVE_PIXELS} {1920}
set_instance_parameter_value cvo {H_BACK_PORCH} {0}
set_instance_parameter_value cvo {H_BLANK} {280}
set_instance_parameter_value cvo {H_FRONT_PORCH} {0}
set_instance_parameter_value cvo {H_SYNC_LENGTH} {0}
set_instance_parameter_value cvo {INTERLACED} {1}
set_instance_parameter_value cvo {LOW_LATENCY} {0}
set_instance_parameter_value cvo {NO_OF_CHANNELS} {1}
set_instance_parameter_value cvo {NO_OF_MODES} {1}
set_instance_parameter_value cvo {NUMBER_OF_COLOUR_PLANES} {2}
set_instance_parameter_value cvo {PIXELS_IN_PARALLEL} {1}
set_instance_parameter_value cvo {SRC_WIDTH} {8}
set_instance_parameter_value cvo {STD_WIDTH} {1}
set_instance_parameter_value cvo {TASK_WIDTH} {8}
set_instance_parameter_value cvo {THRESHOLD} {1919}
set_instance_parameter_value cvo {USE_CONTROL} {0}
set_instance_parameter_value cvo {USE_EMBEDDED_SYNCS} {1}
set_instance_parameter_value cvo {V_ACTIVE_LINES} {1080}
set_instance_parameter_value cvo {V_BACK_PORCH} {0}
set_instance_parameter_value cvo {V_BLANK} {22}
set_instance_parameter_value cvo {V_FRONT_PORCH} {0}
set_instance_parameter_value cvo {V_SYNC_LENGTH} {0}

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

add_instance frame_buffer_color alt_vip_cl_vfb 23.1
set_instance_parameter_value frame_buffer_color {BITS_PER_SYMBOL} {8}
set_instance_parameter_value frame_buffer_color {BURST_ALIGNMENT} {1}
set_instance_parameter_value frame_buffer_color {CLOCKS_ARE_SEPARATE} {1}
set_instance_parameter_value frame_buffer_color {COLOR_PLANES_ARE_IN_PARALLEL} {1}
set_instance_parameter_value frame_buffer_color {CONTROLLED_DROP_REPEAT} {0}
set_instance_parameter_value frame_buffer_color {DROP_FRAMES} {1}
set_instance_parameter_value frame_buffer_color {DROP_INVALID_FIELDS} {0}
set_instance_parameter_value frame_buffer_color {DROP_REPEAT_USER} {0}
set_instance_parameter_value frame_buffer_color {INTERLACED_SUPPORT} {0}
set_instance_parameter_value frame_buffer_color {IS_FRAME_READER} {0}
set_instance_parameter_value frame_buffer_color {IS_FRAME_WRITER} {0}
set_instance_parameter_value frame_buffer_color {IS_SYNC_MASTER} {0}
set_instance_parameter_value frame_buffer_color {IS_SYNC_SLAVE} {0}
set_instance_parameter_value frame_buffer_color {LINE_BASED_BUFFERING} {0}
set_instance_parameter_value frame_buffer_color {MAX_HEIGHT} {1080}
set_instance_parameter_value frame_buffer_color {MAX_SYMBOLS_PER_PACKET} {10}
set_instance_parameter_value frame_buffer_color {MAX_WIDTH} {1920}
set_instance_parameter_value frame_buffer_color {MEM_BASE_ADDR} {0}
set_instance_parameter_value frame_buffer_color {MEM_BUFFER_OFFSET} {16777216}
set_instance_parameter_value frame_buffer_color {MEM_PORT_WIDTH} {256}
set_instance_parameter_value frame_buffer_color {MULTI_FRAME_DELAY} {1}
set_instance_parameter_value frame_buffer_color {NUMBER_OF_COLOR_PLANES} {3}
set_instance_parameter_value frame_buffer_color {PIXELS_IN_PARALLEL} {1}
set_instance_parameter_value frame_buffer_color {PRIORITIZE_FMAX} {0}
set_instance_parameter_value frame_buffer_color {READER_RUNTIME_CONTROL} {0}
set_instance_parameter_value frame_buffer_color {READY_LATENCY} {1}
set_instance_parameter_value frame_buffer_color {READ_BURST_TARGET} {32}
set_instance_parameter_value frame_buffer_color {READ_FIFO_DEPTH} {64}
set_instance_parameter_value frame_buffer_color {REPEAT_FRAMES} {1}
set_instance_parameter_value frame_buffer_color {TEST_INIT} {0}
set_instance_parameter_value frame_buffer_color {USER_PACKETS_MAX_STORAGE} {0}
set_instance_parameter_value frame_buffer_color {USE_BUFFER_OFFSET} {0}
set_instance_parameter_value frame_buffer_color {WRITER_RUNTIME_CONTROL} {0}
set_instance_parameter_value frame_buffer_color {WRITE_BURST_TARGET} {32}
set_instance_parameter_value frame_buffer_color {WRITE_FIFO_DEPTH} {64}

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

add_instance gamma alt_vip_cl_gamma_corrector 23.1
set_instance_parameter_value gamma {COLOR_PLANES_ARE_IN_PARALLEL} {1}
set_instance_parameter_value gamma {CONVERSION_MODE} {LSB}
set_instance_parameter_value gamma {ENABLE_TWO_BANKS} {0}
set_instance_parameter_value gamma {EXTRA_PIPELINING} {0}
set_instance_parameter_value gamma {INPUT_BITS_PER_SYMBOL} {16}
set_instance_parameter_value gamma {LIMITED_READBACK} {0}
set_instance_parameter_value gamma {NUMBER_OF_COLOR_PLANES} {1}
set_instance_parameter_value gamma {OUTPUT_BITS_PER_SYMBOL} {8}
set_instance_parameter_value gamma {PIXELS_IN_PARALLEL} {1}
set_instance_parameter_value gamma {RUNTIME_CONTROL} {1}
set_instance_parameter_value gamma {USER_PACKET_FIFO_DEPTH} {0}
set_instance_parameter_value gamma {USER_PACKET_SUPPORT} {PASSTHROUGH}

add_instance interlacer alt_vip_cl_interlacer 23.1
set_instance_parameter_value interlacer {BITS_PER_SYMBOL} {8}
set_instance_parameter_value interlacer {COLOR_PLANES_ARE_IN_PARALLEL} {1}
set_instance_parameter_value interlacer {CTRL_OVERRIDE} {1}
set_instance_parameter_value interlacer {EXTRA_PIPELINING} {0}
set_instance_parameter_value interlacer {INTERLACE_PASSTHROUGH} {1}
set_instance_parameter_value interlacer {LIMITED_READBACK} {0}
set_instance_parameter_value interlacer {MAX_HEIGHT} {1080}
set_instance_parameter_value interlacer {MAX_WIDTH} {1920}
set_instance_parameter_value interlacer {NUMBER_OF_COLOR_PLANES} {2}
set_instance_parameter_value interlacer {PIXELS_IN_PARALLEL} {1}
set_instance_parameter_value interlacer {RUNTIME_CONTROL} {0}
set_instance_parameter_value interlacer {SEND_F1_FIRST} {1}

add_instance mixer alt_vip_cl_mixer 23.1
set_instance_parameter_value mixer {ALPHA_ENABLE} {0}
set_instance_parameter_value mixer {ALPHA_STREAM_ENABLE0} {0}
set_instance_parameter_value mixer {ALPHA_STREAM_ENABLE1} {0}
set_instance_parameter_value mixer {ALPHA_STREAM_ENABLE10} {0}
set_instance_parameter_value mixer {ALPHA_STREAM_ENABLE11} {0}
set_instance_parameter_value mixer {ALPHA_STREAM_ENABLE12} {0}
set_instance_parameter_value mixer {ALPHA_STREAM_ENABLE13} {0}
set_instance_parameter_value mixer {ALPHA_STREAM_ENABLE14} {0}
set_instance_parameter_value mixer {ALPHA_STREAM_ENABLE15} {0}
set_instance_parameter_value mixer {ALPHA_STREAM_ENABLE16} {0}
set_instance_parameter_value mixer {ALPHA_STREAM_ENABLE17} {0}
set_instance_parameter_value mixer {ALPHA_STREAM_ENABLE18} {0}
set_instance_parameter_value mixer {ALPHA_STREAM_ENABLE19} {0}
set_instance_parameter_value mixer {ALPHA_STREAM_ENABLE2} {0}
set_instance_parameter_value mixer {ALPHA_STREAM_ENABLE3} {0}
set_instance_parameter_value mixer {ALPHA_STREAM_ENABLE4} {0}
set_instance_parameter_value mixer {ALPHA_STREAM_ENABLE5} {0}
set_instance_parameter_value mixer {ALPHA_STREAM_ENABLE6} {0}
set_instance_parameter_value mixer {ALPHA_STREAM_ENABLE7} {0}
set_instance_parameter_value mixer {ALPHA_STREAM_ENABLE8} {0}
set_instance_parameter_value mixer {ALPHA_STREAM_ENABLE9} {0}
set_instance_parameter_value mixer {BITS_PER_SYMBOL} {8}
set_instance_parameter_value mixer {COLOR_PLANES_ARE_IN_PARALLEL} {1}
set_instance_parameter_value mixer {COLOR_SPACE} {RGB}
set_instance_parameter_value mixer {DATA_PIPELINE_STAGES} {0}
set_instance_parameter_value mixer {IS_422} {1}
set_instance_parameter_value mixer {LAYER_POSITION_ENABLE} {0}
set_instance_parameter_value mixer {LIMITED_READBACK} {0}
set_instance_parameter_value mixer {LOW_LATENCY_MODE} {0}
set_instance_parameter_value mixer {MAX_HEIGHT} {1080}
set_instance_parameter_value mixer {MAX_WIDTH} {1920}
set_instance_parameter_value mixer {NO_OF_INPUTS} {2}
set_instance_parameter_value mixer {NUMBER_OF_COLOR_PLANES} {2}
set_instance_parameter_value mixer {PATTERN} {colorbars}
set_instance_parameter_value mixer {PIPELINE_READY} {0}
set_instance_parameter_value mixer {PIXELS_IN_PARALLEL} {1}
set_instance_parameter_value mixer {UNIFORM_VALUE_BCR} {0}
set_instance_parameter_value mixer {UNIFORM_VALUE_GCB} {0}
set_instance_parameter_value mixer {UNIFORM_VALUE_RY} {0}
set_instance_parameter_value mixer {USER_PACKET_FIFO_DEPTH} {0}
set_instance_parameter_value mixer {USER_PACKET_SUPPORT} {DISCARD}

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

add_instance monitor_0 alt_vip_avst_video_monitor 23.1
set_instance_parameter_value monitor_0 {BPS} {16}
set_instance_parameter_value monitor_0 {BUFFER_DEPTH} {256}
set_instance_parameter_value monitor_0 {CAPTURE_SYM_WIDTH} {32}
set_instance_parameter_value monitor_0 {COLOR_PLANES_ARE_IN_PARALLEL} {1}
set_instance_parameter_value monitor_0 {NUMBER_OF_COLOR_PLANES} {1}
set_instance_parameter_value monitor_0 {PIXELS_IN_PARALLEL} {1}
set_instance_parameter_value monitor_0 {THUMBNAIL_SUPPORT} {0}

add_instance monitor_1 alt_vip_avst_video_monitor 23.1
set_instance_parameter_value monitor_1 {BPS} {16}
set_instance_parameter_value monitor_1 {BUFFER_DEPTH} {256}
set_instance_parameter_value monitor_1 {CAPTURE_SYM_WIDTH} {32}
set_instance_parameter_value monitor_1 {COLOR_PLANES_ARE_IN_PARALLEL} {1}
set_instance_parameter_value monitor_1 {NUMBER_OF_COLOR_PLANES} {1}
set_instance_parameter_value monitor_1 {PIXELS_IN_PARALLEL} {1}
set_instance_parameter_value monitor_1 {THUMBNAIL_SUPPORT} {0}

add_instance monitor_2 alt_vip_avst_video_monitor 23.1
set_instance_parameter_value monitor_2 {BPS} {8}
set_instance_parameter_value monitor_2 {BUFFER_DEPTH} {256}
set_instance_parameter_value monitor_2 {CAPTURE_SYM_WIDTH} {32}
set_instance_parameter_value monitor_2 {COLOR_PLANES_ARE_IN_PARALLEL} {1}
set_instance_parameter_value monitor_2 {NUMBER_OF_COLOR_PLANES} {3}
set_instance_parameter_value monitor_2 {PIXELS_IN_PARALLEL} {1}
set_instance_parameter_value monitor_2 {THUMBNAIL_SUPPORT} {0}

add_instance monitor_3 alt_vip_avst_video_monitor 23.1
set_instance_parameter_value monitor_3 {BPS} {8}
set_instance_parameter_value monitor_3 {BUFFER_DEPTH} {256}
set_instance_parameter_value monitor_3 {CAPTURE_SYM_WIDTH} {32}
set_instance_parameter_value monitor_3 {COLOR_PLANES_ARE_IN_PARALLEL} {1}
set_instance_parameter_value monitor_3 {NUMBER_OF_COLOR_PLANES} {3}
set_instance_parameter_value monitor_3 {PIXELS_IN_PARALLEL} {1}
set_instance_parameter_value monitor_3 {THUMBNAIL_SUPPORT} {0}

add_instance monitor_4 alt_vip_avst_video_monitor 23.1
set_instance_parameter_value monitor_4 {BPS} {8}
set_instance_parameter_value monitor_4 {BUFFER_DEPTH} {256}
set_instance_parameter_value monitor_4 {CAPTURE_SYM_WIDTH} {32}
set_instance_parameter_value monitor_4 {COLOR_PLANES_ARE_IN_PARALLEL} {1}
set_instance_parameter_value monitor_4 {NUMBER_OF_COLOR_PLANES} {2}
set_instance_parameter_value monitor_4 {PIXELS_IN_PARALLEL} {1}
set_instance_parameter_value monitor_4 {THUMBNAIL_SUPPORT} {0}

add_instance mono_to_gray alt_vip_cl_cps 23.1
set_instance_parameter_value mono_to_gray {BITS_PER_SYMBOL} {8}
set_instance_parameter_value mono_to_gray {EXTRA_PIPELINING} {0}
set_instance_parameter_value mono_to_gray {INPUT_0_COLOR_PLANES_ARE_IN_PARALLEL} {1}
set_instance_parameter_value mono_to_gray {INPUT_0_FIFO} {0}
set_instance_parameter_value mono_to_gray {INPUT_0_FIFO_SIZE} {8}
set_instance_parameter_value mono_to_gray {INPUT_0_NUMBER_OF_COLOR_PLANES} {1}
set_instance_parameter_value mono_to_gray {INPUT_0_PATTERN} {C0}
set_instance_parameter_value mono_to_gray {INPUT_0_PIXELS_IN_PARALLEL} {1}
set_instance_parameter_value mono_to_gray {INPUT_0_TWO_PIXELS_PATTERN} {0}
set_instance_parameter_value mono_to_gray {INPUT_1_COLOR_PLANES_ARE_IN_PARALLEL} {1}
set_instance_parameter_value mono_to_gray {INPUT_1_FIFO} {0}
set_instance_parameter_value mono_to_gray {INPUT_1_FIFO_SIZE} {8}
set_instance_parameter_value mono_to_gray {INPUT_1_NUMBER_OF_COLOR_PLANES} {3}
set_instance_parameter_value mono_to_gray {INPUT_1_PATTERN} {C0,C1,C2}
set_instance_parameter_value mono_to_gray {INPUT_1_PIXELS_IN_PARALLEL} {1}
set_instance_parameter_value mono_to_gray {INPUT_1_TWO_PIXELS_PATTERN} {0}
set_instance_parameter_value mono_to_gray {INPUT_VALIDATION} {1}
set_instance_parameter_value mono_to_gray {NUMBER_OF_INPUTS} {1}
set_instance_parameter_value mono_to_gray {NUMBER_OF_OUTPUTS} {1}
set_instance_parameter_value mono_to_gray {OUTPUT_0_COLOR_PLANES_ARE_IN_PARALLEL} {1}
set_instance_parameter_value mono_to_gray {OUTPUT_0_FIFO} {0}
set_instance_parameter_value mono_to_gray {OUTPUT_0_FIFO_SIZE} {8}
set_instance_parameter_value mono_to_gray {OUTPUT_0_NUMBER_OF_COLOR_PLANES} {3}
set_instance_parameter_value mono_to_gray {OUTPUT_0_PATTERN} {C0,C0,C0}
set_instance_parameter_value mono_to_gray {OUTPUT_0_PIXELS_IN_PARALLEL} {1}
set_instance_parameter_value mono_to_gray {OUTPUT_0_TWO_PIXELS_PATTERN} {0}
set_instance_parameter_value mono_to_gray {OUTPUT_1_COLOR_PLANES_ARE_IN_PARALLEL} {1}
set_instance_parameter_value mono_to_gray {OUTPUT_1_FIFO} {0}
set_instance_parameter_value mono_to_gray {OUTPUT_1_FIFO_SIZE} {8}
set_instance_parameter_value mono_to_gray {OUTPUT_1_NUMBER_OF_COLOR_PLANES} {3}
set_instance_parameter_value mono_to_gray {OUTPUT_1_PATTERN} {C0,C1,C2}
set_instance_parameter_value mono_to_gray {OUTPUT_1_PIXELS_IN_PARALLEL} {1}
set_instance_parameter_value mono_to_gray {OUTPUT_1_TWO_PIXELS_PATTERN} {0}
set_instance_parameter_value mono_to_gray {OUTPUT_VALIDATION} {1}
set_instance_parameter_value mono_to_gray {USER_PACKET_SUPPORT} {PASSTHROUGH}
set_instance_parameter_value mono_to_gray {USER_PKT_0_TO_0} {1}
set_instance_parameter_value mono_to_gray {USER_PKT_0_TO_1} {0}
set_instance_parameter_value mono_to_gray {USER_PKT_1_TO_0} {0}
set_instance_parameter_value mono_to_gray {USER_PKT_1_TO_1} {1}

add_instance rgb_to_ycbcr alt_vip_cl_csc 23.1
set_instance_parameter_value rgb_to_ycbcr {COEFFICIENT_INT_BITS} {0}
set_instance_parameter_value rgb_to_ycbcr {COEFFICIENT_SIGNED} {1}
set_instance_parameter_value rgb_to_ycbcr {COEF_SUM_FRACTION_BITS} {8}
set_instance_parameter_value rgb_to_ycbcr {COLOR_PLANES_ARE_IN_PARALLEL} {1}
set_instance_parameter_value rgb_to_ycbcr {CONVERSION_MODE} {LSB}
set_instance_parameter_value rgb_to_ycbcr {INPUT_BITS_PER_SYMBOL} {8}
set_instance_parameter_value rgb_to_ycbcr {INPUT_DATA_TYPE_GUARD_BAND} {0}
set_instance_parameter_value rgb_to_ycbcr {INPUT_DATA_TYPE_MAX} {255}
set_instance_parameter_value rgb_to_ycbcr {INPUT_DATA_TYPE_MIN} {0}
set_instance_parameter_value rgb_to_ycbcr {INPUT_DATA_TYPE_SIGNED} {0}
set_instance_parameter_value rgb_to_ycbcr {LIMITED_READBACK} {0}
set_instance_parameter_value rgb_to_ycbcr {MOVE_BINARY_POINT_RIGHT} {0}
set_instance_parameter_value rgb_to_ycbcr {NUMBER_OF_COLOR_PLANES} {3}
set_instance_parameter_value rgb_to_ycbcr {OUTPUT_BITS_PER_SYMBOL} {8}
set_instance_parameter_value rgb_to_ycbcr {OUTPUT_DATA_TYPE_GUARD_BAND} {0}
set_instance_parameter_value rgb_to_ycbcr {OUTPUT_DATA_TYPE_MAX} {255}
set_instance_parameter_value rgb_to_ycbcr {OUTPUT_DATA_TYPE_MIN} {0}
set_instance_parameter_value rgb_to_ycbcr {OUTPUT_DATA_TYPE_SIGNED} {0}
set_instance_parameter_value rgb_to_ycbcr {PIPELINE_DATA_OUTPUT} {1}
set_instance_parameter_value rgb_to_ycbcr {PIXELS_IN_PARALLEL} {1}
set_instance_parameter_value rgb_to_ycbcr {REMOVE_FRACTION_METHOD} {1}
set_instance_parameter_value rgb_to_ycbcr {REQ_FCOEFF_A0} {0.439}
set_instance_parameter_value rgb_to_ycbcr {REQ_FCOEFF_A1} {-0.04}
set_instance_parameter_value rgb_to_ycbcr {REQ_FCOEFF_A2} {0.062}
set_instance_parameter_value rgb_to_ycbcr {REQ_FCOEFF_B0} {-0.338}
set_instance_parameter_value rgb_to_ycbcr {REQ_FCOEFF_B1} {-0.399}
set_instance_parameter_value rgb_to_ycbcr {REQ_FCOEFF_B2} {0.614}
set_instance_parameter_value rgb_to_ycbcr {REQ_FCOEFF_C0} {-0.101}
set_instance_parameter_value rgb_to_ycbcr {REQ_FCOEFF_C1} {0.439}
set_instance_parameter_value rgb_to_ycbcr {REQ_FCOEFF_C2} {0.183}
set_instance_parameter_value rgb_to_ycbcr {REQ_FCOEFF_S0} {128.0}
set_instance_parameter_value rgb_to_ycbcr {REQ_FCOEFF_S1} {128.0}
set_instance_parameter_value rgb_to_ycbcr {REQ_FCOEFF_S2} {16.0}
set_instance_parameter_value rgb_to_ycbcr {RUNTIME_CONTROL} {0}
set_instance_parameter_value rgb_to_ycbcr {SIGN_TO_UNSIGN_METHOD} {0}
set_instance_parameter_value rgb_to_ycbcr {SUMMAND_INT_BITS} {8}
set_instance_parameter_value rgb_to_ycbcr {SUMMAND_SIGNED} {0}
set_instance_parameter_value rgb_to_ycbcr {USER_PACKET_SUPPORT} {PASSTHROUGH}

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

add_instance switch_0 alt_vip_cl_swi 23.1
set_instance_parameter_value switch_0 {BITS_PER_SYMBOL} {16}
set_instance_parameter_value switch_0 {COLOR_PLANES_ARE_IN_PARALLEL} {1}
set_instance_parameter_value switch_0 {NO_OF_INPUTS} {1}
set_instance_parameter_value switch_0 {NO_OF_OUTPUTS} {2}
set_instance_parameter_value switch_0 {NUMBER_OF_COLOR_PLANES} {1}
set_instance_parameter_value switch_0 {PIXELS_IN_PARALLEL} {1}
set_instance_parameter_value switch_0 {READY_LATENCY} {1}

add_instance switch_1 alt_vip_cl_swi 23.1
set_instance_parameter_value switch_1 {BITS_PER_SYMBOL} {16}
set_instance_parameter_value switch_1 {COLOR_PLANES_ARE_IN_PARALLEL} {1}
set_instance_parameter_value switch_1 {NO_OF_INPUTS} {2}
set_instance_parameter_value switch_1 {NO_OF_OUTPUTS} {1}
set_instance_parameter_value switch_1 {NUMBER_OF_COLOR_PLANES} {1}
set_instance_parameter_value switch_1 {PIXELS_IN_PARALLEL} {1}
set_instance_parameter_value switch_1 {READY_LATENCY} {1}

add_instance trace_system altera_trace_system 23.1
set_instance_parameter_value trace_system {CAPTURE_WIDTH} {32}
set_instance_parameter_value trace_system {EXTMEM_BASE} {0}
set_instance_parameter_value trace_system {EXTMEM_SIZE} {1048576}
set_instance_parameter_value trace_system {HOST_LINK_NAME} {}
set_instance_parameter_value trace_system {HOST_TYPE} {JTAG}
set_instance_parameter_value trace_system {INPUTS} {5}
set_instance_parameter_value trace_system {INTERNAL_MEM} {1}
set_instance_parameter_value trace_system {MANUAL_DEBUG_FABRIC} {0}
set_instance_parameter_value trace_system {MEMSIZE} {32768}
set_instance_parameter_value trace_system {PIPELINE_STAGE_ON_ALL_INPUTS} {1}

add_instance ycbcr444_to_422 alt_vip_cl_cps 23.1
set_instance_parameter_value ycbcr444_to_422 {BITS_PER_SYMBOL} {8}
set_instance_parameter_value ycbcr444_to_422 {EXTRA_PIPELINING} {0}
set_instance_parameter_value ycbcr444_to_422 {INPUT_0_COLOR_PLANES_ARE_IN_PARALLEL} {1}
set_instance_parameter_value ycbcr444_to_422 {INPUT_0_FIFO} {0}
set_instance_parameter_value ycbcr444_to_422 {INPUT_0_FIFO_SIZE} {8}
set_instance_parameter_value ycbcr444_to_422 {INPUT_0_NUMBER_OF_COLOR_PLANES} {3}
set_instance_parameter_value ycbcr444_to_422 {INPUT_0_PATTERN} {C0,C1,C2}
set_instance_parameter_value ycbcr444_to_422 {INPUT_0_PIXELS_IN_PARALLEL} {1}
set_instance_parameter_value ycbcr444_to_422 {INPUT_0_TWO_PIXELS_PATTERN} {0}
set_instance_parameter_value ycbcr444_to_422 {INPUT_1_COLOR_PLANES_ARE_IN_PARALLEL} {1}
set_instance_parameter_value ycbcr444_to_422 {INPUT_1_FIFO} {0}
set_instance_parameter_value ycbcr444_to_422 {INPUT_1_FIFO_SIZE} {8}
set_instance_parameter_value ycbcr444_to_422 {INPUT_1_NUMBER_OF_COLOR_PLANES} {3}
set_instance_parameter_value ycbcr444_to_422 {INPUT_1_PATTERN} {C0,C1,C2}
set_instance_parameter_value ycbcr444_to_422 {INPUT_1_PIXELS_IN_PARALLEL} {1}
set_instance_parameter_value ycbcr444_to_422 {INPUT_1_TWO_PIXELS_PATTERN} {0}
set_instance_parameter_value ycbcr444_to_422 {INPUT_VALIDATION} {1}
set_instance_parameter_value ycbcr444_to_422 {NUMBER_OF_INPUTS} {1}
set_instance_parameter_value ycbcr444_to_422 {NUMBER_OF_OUTPUTS} {1}
set_instance_parameter_value ycbcr444_to_422 {OUTPUT_0_COLOR_PLANES_ARE_IN_PARALLEL} {1}
set_instance_parameter_value ycbcr444_to_422 {OUTPUT_0_FIFO} {0}
set_instance_parameter_value ycbcr444_to_422 {OUTPUT_0_FIFO_SIZE} {8}
set_instance_parameter_value ycbcr444_to_422 {OUTPUT_0_NUMBER_OF_COLOR_PLANES} {2}
set_instance_parameter_value ycbcr444_to_422 {OUTPUT_0_PATTERN} {C0,C1,C0,C2}
set_instance_parameter_value ycbcr444_to_422 {OUTPUT_0_PIXELS_IN_PARALLEL} {1}
set_instance_parameter_value ycbcr444_to_422 {OUTPUT_0_TWO_PIXELS_PATTERN} {1}
set_instance_parameter_value ycbcr444_to_422 {OUTPUT_1_COLOR_PLANES_ARE_IN_PARALLEL} {1}
set_instance_parameter_value ycbcr444_to_422 {OUTPUT_1_FIFO} {0}
set_instance_parameter_value ycbcr444_to_422 {OUTPUT_1_FIFO_SIZE} {8}
set_instance_parameter_value ycbcr444_to_422 {OUTPUT_1_NUMBER_OF_COLOR_PLANES} {3}
set_instance_parameter_value ycbcr444_to_422 {OUTPUT_1_PATTERN} {C0,C1,C2}
set_instance_parameter_value ycbcr444_to_422 {OUTPUT_1_PIXELS_IN_PARALLEL} {1}
set_instance_parameter_value ycbcr444_to_422 {OUTPUT_1_TWO_PIXELS_PATTERN} {0}
set_instance_parameter_value ycbcr444_to_422 {OUTPUT_VALIDATION} {1}
set_instance_parameter_value ycbcr444_to_422 {USER_PACKET_SUPPORT} {PASSTHROUGH}
set_instance_parameter_value ycbcr444_to_422 {USER_PKT_0_TO_0} {1}
set_instance_parameter_value ycbcr444_to_422 {USER_PKT_0_TO_1} {0}
set_instance_parameter_value ycbcr444_to_422 {USER_PKT_1_TO_0} {0}
set_instance_parameter_value ycbcr444_to_422 {USER_PKT_1_TO_1} {1}

# exported interfaces
add_interface clk_memory clock sink
set_interface_property clk_memory EXPORT_OF clk_memory.clk_in
add_interface clk_mono_video clock sink
set_interface_property clk_mono_video EXPORT_OF clk_mono_video.clk_in
add_interface cvi_color_clocked_video conduit end
set_interface_property cvi_color_clocked_video EXPORT_OF cvi_color.clocked_video
add_interface cvi_color_status_update_irq interrupt sender
set_interface_property cvi_color_status_update_irq EXPORT_OF cvi_color.status_update_irq
add_interface cvi_mono_clocked_video conduit end
set_interface_property cvi_mono_clocked_video EXPORT_OF cvi_mono.clocked_video
add_interface cvi_mono_status_update_irq interrupt sender
set_interface_property cvi_mono_status_update_irq EXPORT_OF cvi_mono.status_update_irq
add_interface cvo_clocked_video conduit end
set_interface_property cvo_clocked_video EXPORT_OF cvo.clocked_video
add_interface frame_buffer_color_mem_master_rd avalon master
set_interface_property frame_buffer_color_mem_master_rd EXPORT_OF frame_buffer_color.mem_master_rd
add_interface frame_buffer_color_mem_master_wr avalon master
set_interface_property frame_buffer_color_mem_master_wr EXPORT_OF frame_buffer_color.mem_master_wr
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
add_interface switch_0_interrupt interrupt sender
set_interface_property switch_0_interrupt EXPORT_OF switch_0.interrupt
add_interface switch_1_interrupt interrupt sender
set_interface_property switch_1_interrupt EXPORT_OF switch_1.interrupt

# connections and connection parameters
add_connection clipper.dout frame_buffer_mono.din

add_connection clk_memory.clk frame_buffer_color.mem_clock

add_connection clk_memory.clk frame_buffer_mono.mem_clock

add_connection clk_memory.clk_reset frame_buffer_color.mem_reset

add_connection clk_memory.clk_reset frame_buffer_mono.mem_reset

add_connection clk_mono_video.clk clipper.main_clock

add_connection clk_mono_video.clk cvi_color.main_clock

add_connection clk_mono_video.clk cvi_mono.main_clock

add_connection clk_mono_video.clk cvo.main_clock

add_connection clk_mono_video.clk fir.main_clock

add_connection clk_mono_video.clk frame_buffer_color.main_clock

add_connection clk_mono_video.clk frame_buffer_mono.main_clock

add_connection clk_mono_video.clk gamma.main_clock

add_connection clk_mono_video.clk interlacer.main_clock

add_connection clk_mono_video.clk mixer.main_clock

add_connection clk_mono_video.clk mm_bridge.clk

add_connection clk_mono_video.clk monitor_0.clock

add_connection clk_mono_video.clk monitor_1.clock

add_connection clk_mono_video.clk monitor_2.clock

add_connection clk_mono_video.clk monitor_3.clock

add_connection clk_mono_video.clk monitor_4.clock

add_connection clk_mono_video.clk mono_to_gray.main_clock

add_connection clk_mono_video.clk rgb_to_ycbcr.main_clock

add_connection clk_mono_video.clk sc_fifo_0.clk

add_connection clk_mono_video.clk scaler.main_clock

add_connection clk_mono_video.clk switch_0.main_clock

add_connection clk_mono_video.clk switch_1.main_clock

add_connection clk_mono_video.clk trace_system.clk

add_connection clk_mono_video.clk ycbcr444_to_422.main_clock

add_connection clk_mono_video.clk_reset clipper.main_reset

add_connection clk_mono_video.clk_reset cvi_color.main_reset

add_connection clk_mono_video.clk_reset cvi_mono.main_reset

add_connection clk_mono_video.clk_reset cvo.main_reset

add_connection clk_mono_video.clk_reset fir.main_reset

add_connection clk_mono_video.clk_reset frame_buffer_color.main_reset

add_connection clk_mono_video.clk_reset frame_buffer_mono.main_reset

add_connection clk_mono_video.clk_reset gamma.main_reset

add_connection clk_mono_video.clk_reset interlacer.main_reset

add_connection clk_mono_video.clk_reset mixer.main_reset

add_connection clk_mono_video.clk_reset mm_bridge.reset

add_connection clk_mono_video.clk_reset monitor_0.reset

add_connection clk_mono_video.clk_reset monitor_1.reset

add_connection clk_mono_video.clk_reset monitor_2.reset

add_connection clk_mono_video.clk_reset monitor_3.reset

add_connection clk_mono_video.clk_reset monitor_4.reset

add_connection clk_mono_video.clk_reset mono_to_gray.main_reset

add_connection clk_mono_video.clk_reset rgb_to_ycbcr.main_reset

add_connection clk_mono_video.clk_reset sc_fifo_0.clk_reset

add_connection clk_mono_video.clk_reset scaler.main_reset

add_connection clk_mono_video.clk_reset switch_0.main_clock_reset

add_connection clk_mono_video.clk_reset switch_1.main_clock_reset

add_connection clk_mono_video.clk_reset ycbcr444_to_422.main_reset

add_connection cvi_color.dout_0 monitor_2.din

add_connection cvi_mono.dout_0 sc_fifo_0.in

add_connection fir.dout clipper.din

add_connection frame_buffer_color.dout monitor_3.din

add_connection frame_buffer_mono.dout monitor_1.din

add_connection gamma.dout mono_to_gray.din_0

add_connection interlacer.dout monitor_4.din

add_connection mixer.dout rgb_to_ycbcr.din

add_connection mm_bridge.m0 clipper.control
set_connection_parameter_value mm_bridge.m0/clipper.control arbitrationPriority {1}
set_connection_parameter_value mm_bridge.m0/clipper.control baseAddress {0x00080400}
set_connection_parameter_value mm_bridge.m0/clipper.control defaultConnection {0}

add_connection mm_bridge.m0 cvi_color.control
set_connection_parameter_value mm_bridge.m0/cvi_color.control arbitrationPriority {1}
set_connection_parameter_value mm_bridge.m0/cvi_color.control baseAddress {0x00080300}
set_connection_parameter_value mm_bridge.m0/cvi_color.control defaultConnection {0}

add_connection mm_bridge.m0 cvi_mono.control
set_connection_parameter_value mm_bridge.m0/cvi_mono.control arbitrationPriority {1}
set_connection_parameter_value mm_bridge.m0/cvi_mono.control baseAddress {0x00080380}
set_connection_parameter_value mm_bridge.m0/cvi_mono.control defaultConnection {0}

add_connection mm_bridge.m0 gamma.control
set_connection_parameter_value mm_bridge.m0/gamma.control arbitrationPriority {1}
set_connection_parameter_value mm_bridge.m0/gamma.control baseAddress {0x0000}
set_connection_parameter_value mm_bridge.m0/gamma.control defaultConnection {0}

add_connection mm_bridge.m0 mixer.control
set_connection_parameter_value mm_bridge.m0/mixer.control arbitrationPriority {1}
set_connection_parameter_value mm_bridge.m0/mixer.control baseAddress {0x00080000}
set_connection_parameter_value mm_bridge.m0/mixer.control defaultConnection {0}

add_connection mm_bridge.m0 switch_0.control
set_connection_parameter_value mm_bridge.m0/switch_0.control arbitrationPriority {1}
set_connection_parameter_value mm_bridge.m0/switch_0.control baseAddress {0x00080280}
set_connection_parameter_value mm_bridge.m0/switch_0.control defaultConnection {0}

add_connection mm_bridge.m0 switch_1.control
set_connection_parameter_value mm_bridge.m0/switch_1.control arbitrationPriority {1}
set_connection_parameter_value mm_bridge.m0/switch_1.control baseAddress {0x00080200}
set_connection_parameter_value mm_bridge.m0/switch_1.control defaultConnection {0}

add_connection monitor_0.capture trace_system.capture_0

add_connection monitor_0.dout fir.din

add_connection monitor_1.capture trace_system.capture_1

add_connection monitor_1.dout switch_1.din_0

add_connection monitor_2.capture trace_system.capture_2

add_connection monitor_2.dout frame_buffer_color.din

add_connection monitor_3.capture trace_system.capture_3

add_connection monitor_3.dout mixer.din1

add_connection monitor_4.capture trace_system.capture_4

add_connection monitor_4.dout cvo.din

add_connection mono_to_gray.dout_0 mixer.din0

add_connection rgb_to_ycbcr.dout ycbcr444_to_422.din_0

add_connection sc_fifo_0.out switch_0.din_0

add_connection scaler.dout gamma.din

add_connection switch_0.dout_0 monitor_0.din

add_connection switch_0.dout_1 switch_1.din_1

add_connection switch_1.dout_0 scaler.din

add_connection trace_system.control_0 monitor_0.control
set_connection_parameter_value trace_system.control_0/monitor_0.control arbitrationPriority {1}
set_connection_parameter_value trace_system.control_0/monitor_0.control baseAddress {0x0000}
set_connection_parameter_value trace_system.control_0/monitor_0.control defaultConnection {0}

add_connection trace_system.control_1 monitor_1.control
set_connection_parameter_value trace_system.control_1/monitor_1.control arbitrationPriority {1}
set_connection_parameter_value trace_system.control_1/monitor_1.control baseAddress {0x0000}
set_connection_parameter_value trace_system.control_1/monitor_1.control defaultConnection {0}

add_connection trace_system.control_2 monitor_2.control
set_connection_parameter_value trace_system.control_2/monitor_2.control arbitrationPriority {1}
set_connection_parameter_value trace_system.control_2/monitor_2.control baseAddress {0x0000}
set_connection_parameter_value trace_system.control_2/monitor_2.control defaultConnection {0}

add_connection trace_system.control_3 monitor_3.control
set_connection_parameter_value trace_system.control_3/monitor_3.control arbitrationPriority {1}
set_connection_parameter_value trace_system.control_3/monitor_3.control baseAddress {0x0000}
set_connection_parameter_value trace_system.control_3/monitor_3.control defaultConnection {0}

add_connection trace_system.control_4 monitor_4.control
set_connection_parameter_value trace_system.control_4/monitor_4.control arbitrationPriority {1}
set_connection_parameter_value trace_system.control_4/monitor_4.control baseAddress {0x0000}
set_connection_parameter_value trace_system.control_4/monitor_4.control defaultConnection {0}

add_connection trace_system.reset monitor_0.reset

add_connection trace_system.reset monitor_1.reset

add_connection trace_system.reset monitor_2.reset

add_connection trace_system.reset monitor_3.reset

add_connection trace_system.reset monitor_4.reset

add_connection ycbcr444_to_422.dout_0 interlacer.din

# interconnect requirements
set_interconnect_requirement {$system} {qsys_mm.clockCrossingAdapter} {HANDSHAKE}
set_interconnect_requirement {$system} {qsys_mm.enableEccProtection} {FALSE}
set_interconnect_requirement {$system} {qsys_mm.insertDefaultSlave} {FALSE}
set_interconnect_requirement {$system} {qsys_mm.maxAdditionalLatency} {1}

save_system {platform.qsys}
