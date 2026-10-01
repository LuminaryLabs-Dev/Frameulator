//! Deterministic, dependency-free state core for the browser simulator.

const IDLE: u32 = 0;
const READY: u32 = 1;
const SYNCHRONIZED: u32 = 2;
const VISIBLE: u32 = 3;
const FOCUSED: u32 = 4;
const STOPPING: u32 = 5;
const LOSS_PENDING: u32 = 6;
const EXITING: u32 = 7;

static mut STATE: u32 = IDLE;
static mut ELAPSED_MICROS: u64 = 0;
static mut FRAME_COUNT: u64 = 0;
static mut EVENT_COUNT: u32 = 0;

#[no_mangle]
pub extern "C" fn frameulator_reset() {
    unsafe {
        STATE = IDLE;
        ELAPSED_MICROS = 0;
        FRAME_COUNT = 0;
        EVENT_COUNT = 0;
    }
}

#[no_mangle]
pub extern "C" fn frameulator_start() -> u32 {
    unsafe {
        STATE = READY;
        STATE
    }
}

#[no_mangle]
pub extern "C" fn frameulator_stop() -> u32 {
    unsafe {
        STATE = STOPPING;
        STATE
    }
}

#[no_mangle]
pub extern "C" fn frameulator_step(delta_micros: u32) -> u32 {
    unsafe {
        ELAPSED_MICROS = ELAPSED_MICROS.saturating_add(delta_micros as u64);
        FRAME_COUNT = FRAME_COUNT.saturating_add(1);
        STATE = match STATE {
            READY => SYNCHRONIZED,
            SYNCHRONIZED => VISIBLE,
            VISIBLE => FOCUSED,
            STOPPING => IDLE,
            state => state,
        };
        STATE
    }
}

#[no_mangle]
pub extern "C" fn frameulator_inject_event(event: u32) -> u32 {
    unsafe {
        EVENT_COUNT = EVENT_COUNT.saturating_add(1);
        STATE = match event {
            1 => LOSS_PENDING,
            2 => FOCUSED,
            3 => EXITING,
            4 => VISIBLE,
            _ => STATE,
        };
        STATE
    }
}

#[no_mangle]
pub extern "C" fn frameulator_session_state() -> u32 {
    unsafe { STATE }
}

#[no_mangle]
pub extern "C" fn frameulator_frame_count() -> u64 {
    unsafe { FRAME_COUNT }
}

#[no_mangle]
pub extern "C" fn frameulator_elapsed_micros() -> u64 {
    unsafe { ELAPSED_MICROS }
}

#[no_mangle]
pub extern "C" fn frameulator_event_count() -> u32 {
    unsafe { EVENT_COUNT }
}

#[no_mangle]
pub extern "C" fn frameulator_abi_version() -> u32 {
    1
}

