use std::{
    ffi::CStr,
    mem,
    os::raw::c_void,
    sync::{Mutex, OnceLock},
};

use objc2::{
    ffi,
    runtime::{AnyClass, AnyObject, Imp, Sel},
    sel,
};
use tauri::Manager;

use crate::{config, guard};

const NS_TERMINATE_CANCEL: isize = 0;
const NS_TERMINATE_NOW: isize = 1;

static APP_HANDLE: OnceLock<Mutex<tauri::AppHandle>> = OnceLock::new();

pub fn install(app: tauri::AppHandle) -> Result<(), String> {
    let _ = APP_HANDLE.set(Mutex::new(app));

    let delegate_class = AnyClass::get(c"TaoAppDelegateParent")
        .ok_or_else(|| "Tao app delegate class was not registered".to_string())?;
    let imp: Imp = unsafe {
        mem::transmute(
            application_should_terminate
                as unsafe extern "C-unwind" fn(&AnyObject, Sel, *mut c_void) -> isize,
        )
    };

    unsafe {
        ffi::class_replaceMethod(
            delegate_class as *const AnyClass as *mut AnyClass,
            sel!(applicationShouldTerminate:),
            imp,
            CStr::from_bytes_with_nul_unchecked(b"q@:@\0").as_ptr(),
        );
    }

    Ok(())
}

unsafe extern "C-unwind" fn application_should_terminate(
    _: &AnyObject,
    _: Sel,
    _: *mut c_void,
) -> isize {
    let Some(app) = APP_HANDLE
        .get()
        .and_then(|handle| handle.lock().ok().map(|app| app.clone()))
    else {
        return NS_TERMINATE_NOW;
    };

    let guard = app.state::<guard::watchdog::GuardState>();
    if guard.consume_exit_allowance().unwrap_or(false) {
        return NS_TERMINATE_NOW;
    }

    let strong_guard_active = app
        .state::<config::manager::ConfigState>()
        .get_preferences()
        .map(|preferences| preferences.strong_guard_enabled)
        .unwrap_or(true)
        && guard.is_active().unwrap_or(false);

    if !strong_guard_active {
        let _ = guard::watchdog::disable_supervisor(&app);
        return NS_TERMINATE_NOW;
    }

    let _ = guard::watchdog::show_main_window(&app);
    let _ = guard::watchdog::emit_quit_required(&app, "dock_quit", false);
    NS_TERMINATE_CANCEL
}
