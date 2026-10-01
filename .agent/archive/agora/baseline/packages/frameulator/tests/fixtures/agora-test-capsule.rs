//! Test-only implementation of the public Agora capsule ABI 2.

static mut STATE: u32 = 0;
static mut FRAMES: u64 = 0;
static mut ELAPSED: u64 = 0;
static mut DEVICE: u32 = 0;
static mut DEPLOYMENT: u32 = 0;
static mut APP_SESSION: u32 = 0;
static mut TEST: u32 = 0;
static mut PROJECT: u32 = 0;
static mut CURRENT: u32 = 0;
static mut PREVIOUS: u32 = 0;
static mut PENDING: u32 = 0;
static mut EVENTS: u32 = 1;
static mut LAST_EVENT: u32 = 0;
static mut TRACKING: u32 = 1;

#[no_mangle]
pub extern "C" fn agora_capsule_abi_version() -> u32 { 2 }

#[no_mangle]
pub extern "C" fn agora_capsule_version() -> u32 { 2 }

#[no_mangle]
pub extern "C" fn agora_capsule_stereo_contract_valid() -> u32 { 1 }

#[no_mangle]
pub extern "C" fn agora_capsule_reset() {
    unsafe {
        STATE = 0; FRAMES = 0; ELAPSED = 0; DEVICE = 0; DEPLOYMENT = 0;
        APP_SESSION = 0; TEST = 0; PROJECT = 0; CURRENT = 0; PREVIOUS = 0;
        PENDING = 0; EVENTS = 1; LAST_EVENT = 0; TRACKING = 1;
    }
}

#[no_mangle]
pub extern "C" fn agora_capsule_start() -> u32 {
    unsafe {
        if APP_SESSION != 2 { return 0; }
        STATE = 1;
        STATE
    }
}

#[no_mangle]
pub extern "C" fn agora_capsule_stop() -> u32 { unsafe { STATE = 5; STATE } }

#[no_mangle]
pub extern "C" fn agora_capsule_step(delta: u32) -> u32 {
    unsafe {
        ELAPSED += delta as u64;
        match DEPLOYMENT {
            1 => { DEPLOYMENT = 2; LAST_EVENT = 4; EVENTS += 1; }
            3 => { PREVIOUS = CURRENT; CURRENT = PENDING; PENDING = 0; DEPLOYMENT = 2; LAST_EVENT = 10; EVENTS += 1; }
            4 => { let departing = CURRENT; CURRENT = PENDING; PREVIOUS = if departing == CURRENT { 0 } else { departing }; PENDING = 0; DEPLOYMENT = 2; LAST_EVENT = 13; EVENTS += 1; }
            5 => { DEPLOYMENT = 0; CURRENT = 0; PREVIOUS = 0; PROJECT = 0; LAST_EVENT = 15; EVENTS += 1; }
            _ => {}
        }
        match APP_SESSION {
            1 => { APP_SESSION = 2; LAST_EVENT = 6; EVENTS += 1; }
            3 => { APP_SESSION = 0; LAST_EVENT = 8; EVENTS += 1; }
            _ => {}
        }
        if APP_SESSION != 2 {
            if STATE == 5 { STATE = 0; }
            return STATE;
        }
        FRAMES += 1;
        STATE = match STATE { 1 => 2, 2 => 3, 3 => 4, state => state };
        STATE
    }
}

#[no_mangle]
pub extern "C" fn agora_capsule_set_tracking(available: u32) -> u32 {
    unsafe { TRACKING = available; STATE = if available == 0 { 6 } else if APP_SESSION == 2 { 4 } else { 0 }; STATE }
}

#[no_mangle]
pub extern "C" fn agora_capsule_tracking_available() -> u32 { unsafe { TRACKING } }

#[no_mangle]
pub extern "C" fn agora_capsule_session_state() -> u32 { unsafe { STATE } }

#[no_mangle]
pub extern "C" fn agora_capsule_frame_count() -> u64 { unsafe { FRAMES } }

#[no_mangle]
pub extern "C" fn agora_capsule_elapsed_micros() -> u64 { unsafe { ELAPSED } }

#[no_mangle]
pub extern "C" fn agora_capsule_scene_phase_milliradians() -> u32 { unsafe { (ELAPSED / 1_000) as u32 } }

#[no_mangle]
pub extern "C" fn agora_capsule_management_command(command: u32, value: u32) -> u32 {
    unsafe {
        let valid = match command {
            1 => { DEVICE = 1; LAST_EVENT = 1; true }
            2 if value > 0 => { CURRENT = value; LAST_EVENT = 2; true }
            3 if DEVICE == 1 && CURRENT > 0 && DEPLOYMENT == 0 => { DEPLOYMENT = 1; LAST_EVENT = 3; true }
            4 if DEPLOYMENT == 2 && APP_SESSION == 0 => { APP_SESSION = 1; LAST_EVENT = 5; true }
            5 if APP_SESSION == 2 => { APP_SESSION = 3; LAST_EVENT = 7; true }
            6 if DEPLOYMENT == 2 && APP_SESSION == 0 && value != CURRENT => { PENDING = value; DEPLOYMENT = 3; LAST_EVENT = 9; true }
            7 if DEPLOYMENT == 3 => { PENDING = CURRENT; DEPLOYMENT = 4; LAST_EVENT = 11; true }
            8 if DEPLOYMENT == 2 && PREVIOUS > 0 => { PENDING = PREVIOUS; DEPLOYMENT = 4; LAST_EVENT = 12; true }
            9 if DEPLOYMENT == 2 && APP_SESSION == 0 => { DEPLOYMENT = 5; LAST_EVENT = 14; true }
            10 if APP_SESSION == 2 => { APP_SESSION = 4; TEST = 3; LAST_EVENT = 16; true }
            11 => { PROJECT = 1; LAST_EVENT = 17; true }
            12 if PROJECT == 1 => { PROJECT = 2; LAST_EVENT = 18; true }
            13 if PROJECT == 2 => { PROJECT = 3; LAST_EVENT = 19; true }
            14 => { TEST = 1; LAST_EVENT = 20; true }
            15 => { TEST = 2; LAST_EVENT = 21; true }
            16 => { TEST = 3; LAST_EVENT = 22; true }
            17 if APP_SESSION == 4 => { APP_SESSION = 0; LAST_EVENT = 23; true }
            _ => false,
        };
        if valid { EVENTS += 1; 0 } else { 2 }
    }
}

#[no_mangle]
pub extern "C" fn agora_capsule_management_device_state() -> u32 { unsafe { DEVICE } }
#[no_mangle]
pub extern "C" fn agora_capsule_management_deployment_state() -> u32 { unsafe { DEPLOYMENT } }
#[no_mangle]
pub extern "C" fn agora_capsule_management_session_state() -> u32 { unsafe { APP_SESSION } }
#[no_mangle]
pub extern "C" fn agora_capsule_management_test_state() -> u32 { unsafe { TEST } }
#[no_mangle]
pub extern "C" fn agora_capsule_management_project_state() -> u32 { unsafe { PROJECT } }
#[no_mangle]
pub extern "C" fn agora_capsule_management_current_release() -> u32 { unsafe { CURRENT } }
#[no_mangle]
pub extern "C" fn agora_capsule_management_previous_release() -> u32 { unsafe { PREVIOUS } }
#[no_mangle]
pub extern "C" fn agora_capsule_management_event_count() -> u32 { unsafe { EVENTS } }
#[no_mangle]
pub extern "C" fn agora_capsule_management_last_event() -> u32 { unsafe { LAST_EVENT } }
#[no_mangle]
pub extern "C" fn agora_capsule_management_event_sequence(index: u32) -> u32 { index }
#[no_mangle]
pub extern "C" fn agora_capsule_management_event_kind(_index: u32) -> u32 { unsafe { LAST_EVENT } }
#[no_mangle]
pub extern "C" fn agora_capsule_management_event_value(_index: u32) -> u32 { 0 }
