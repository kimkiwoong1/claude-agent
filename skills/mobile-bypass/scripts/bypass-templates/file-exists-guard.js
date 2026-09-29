/*
 * 공용 File.exists() 훅 - 여러 탐지모듈(루팅탐지, 에뮬레이터탐지)의 경로 체크를 하나로 통합
 * 원칙: 같은 Java 메서드는 스크립트 전체에서 딱 한 번만 override 해야 함.
 *       root-detection.md, emulator-detection.md 각각에서 개별적으로 File.exists를 override하면
 *       마지막에 로드된 것만 살아남고 앞의 훅은 무효화됨.
 * 사용법: 이 파일을 base로 두고, 필요한 블록리스트만 아래 배열에 추가/제거
 */

Java.perform(function () {
    // 루팅탐지 관련 경로 (root-detection.md)
    var ROOT_PATHS = [
        "/system/bin/su",
        "/system/xbin/su",
        "/sbin/su",
        "/system/app/Superuser.apk",
        "/system/app/SuperSU.apk",
    ];

    // 에뮬레이터탐지 관련 경로 (emulator-detection.md)
    var EMULATOR_PATHS = [
        "/dev/socket/qemud",
        "/dev/qemu_pipe",
        "/system/lib/libc_malloc_debug_qemu.so",
    ];

    // 필요한 케이스에 맞게 아래 배열만 조정 (전부 합칠 수도, 하나만 쓸 수도 있음)
    var BLOCKED_PATHS = ROOT_PATHS.concat(EMULATOR_PATHS);

    var File = Java.use("java.io.File");
    File.exists.implementation = function () {
        var path = this.getAbsolutePath();
        if (BLOCKED_PATHS.indexOf(path) !== -1) {
            console.log("[+] File.exists(" + path + ") -> false 강제 (통합 훅)");
            return false;
        }
        return this.exists(); // 원본 동작 유지 - 다른 정상 파일 체크에는 영향 없어야 함
    };

    console.log("[+] Hooked: java.io.File.exists() (통합 - 루팅+에뮬레이터 " + BLOCKED_PATHS.length + "개 경로)");
});
