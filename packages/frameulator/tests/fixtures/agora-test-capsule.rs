//! Test-only implementation of the public Agora capsule ABI.

static mut STATE: u32 = 0;
static mut FRAMES: u64 = 0;
static mut ELAPSED: u64 = 0;

#[no_mangle]
pub extern "C" fn agora_capsule_abi_version() -> u32 { 1 }

#[no_mangle]
pub extern "C" fn agora_capsule_version() -> u32 { 1 }

#[no_mangle]
pub extern "C" fn agora_capsule_stereo_contract_valid() -> u32 { 1 }

#[no_mangle]
pub extern "C" fn agora_capsule_reset() {
    unsafe { STATE = 0; FRAMES = 0; ELAPSED = 0; }
}

#[no_mangle]
pub extern "C" fn agora_capsule_start() -> u32 { unsafe { STATE = 1; STATE } }

#[no_mangle]
pub extern "C" fn agora_capsule_stop() -> u32 { unsafe { STATE = 5; STATE } }

#[no_mangle]
pub extern "C" fn agora_capsule_step(delta: u32) -> u32 {
    unsafe {
        ELAPSED += delta as u64;
        FRAMES += 1;
        STATE = match STATE { 1 => 2, 2 => 3, 3 => 4, state => state };
        STATE
    }
}

#[no_mangle]
pub extern "C" fn agora_capsule_set_tracking(available: u32) -> u32 {
    unsafe { STATE = if available == 0 { 6 } else { 4 }; STATE }
}

#[no_mangle]
pub extern "C" fn agora_capsule_session_state() -> u32 { unsafe { STATE } }

#[no_mangle]
pub extern "C" fn agora_capsule_frame_count() -> u64 { unsafe { FRAMES } }

#[no_mangle]
pub extern "C" fn agora_capsule_elapsed_micros() -> u64 { unsafe { ELAPSED } }

#[no_mangle]
pub extern "C" fn agora_capsule_scene_phase_milliradians() -> u32 { unsafe { (ELAPSED / 1_000) as u32 } }
