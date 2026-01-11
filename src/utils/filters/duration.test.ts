// Duration filter tests
import { duration } from "./duration";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
    try {
        fn();
        passed++;
        console.log("OK " + name);
    } catch (error) {
        failed++;
        console.log("FAIL " + name);
        console.log("  " + error);
    }
}

function expect(actual: any) {
    return {
        toBe(expected: any) {
            if (actual !== expected) {
                throw new Error("Expected " + JSON.stringify(expected) + ", got " + JSON.stringify(actual));
            }
        }
    };
}

console.log("Duration filter tests");

test("PT1868S should convert to 0:31:08", () => {
    expect(duration("PT1868S", "H:mm:ss")).toBe("0:31:08");
});

test("PT60M should convert to 01:00:00", () => {
    expect(duration("PT60M")).toBe("01:00:00");
});

test("PT80M should convert to 01:20:00", () => {
    expect(duration("PT80M")).toBe("01:20:00");
});

test("PT1H30M should convert to 01:30:00", () => {
    expect(duration("PT1H30M")).toBe("01:30:00");
});

test("PT5M30S should convert to 05:30", () => {
    expect(duration("PT5M30S")).toBe("05:30");
});

test("3665 seconds should convert to 1:01:05", () => {
    expect(duration("3665", "H:mm:ss")).toBe("1:01:05");
});

test("invalid string should return as-is", () => {
    expect(duration("invalid")).toBe("invalid");
});

console.log(passed + " passed, " + failed + " failed");
process.exit(failed > 0 ? 1 : 0);

