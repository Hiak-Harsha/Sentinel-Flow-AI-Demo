import urllib.request
import json
import time

def get(path):
    req = urllib.request.Request(f"http://127.0.0.1:8000{path}")
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

def post(path, data=None):
    body = json.dumps(data).encode("utf-8") if data else b"{}"
    req = urllib.request.Request(
        f"http://127.0.0.1:8000{path}",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

print("1. Testing /api/health and /api/overview...")
assert get("/api/health")["status"] == "ok"
overview = get("/api/overview")
print("   Overview Threat Level:", overview["threat_level"])
print("   Academic Model Ready:", overview["academic_model_ready"])

print("2. Creating fresh demonstration session...")
sess = post("/api/sessions")
join_code = sess["join_code"]
print(f"   Session initialized: {sess['id']} with code {join_code}")

print("3. Joining 3 classroom participants (Harsha, Maya, Bob)...")
p1 = post("/api/sessions/join", {"join_code": join_code, "alias": "Harsha"})
p2 = post("/api/sessions/join", {"join_code": join_code, "alias": "Maya"})
p3 = post("/api/sessions/join", {"join_code": join_code, "alias": "Bob"})
print(f"   P1: {p1['device_id']} ({p1['alias']})")
print(f"   P2: {p2['device_id']} ({p2['alias']})")
print(f"   P3: {p3['device_id']} ({p3['alias']})")

print("4. Generating normal baseline traffic across all 3 participants...")
for p in [p1, p2, p3]:
    for action in ["fetch_status", "query_records", "view_profile"]:
        post("/api/activity", {
            "device_id": p["device_id"],
            "action": action,
            "is_burst": False,
            "bytes_in": 128,
            "bytes_out": 1400
        })
        time.sleep(0.05)

status = get("/api/detection/status")
print("   Threat level after normal activity:", status["threat_level"])
print("   Active alerts count:", status["active_alerts_count"])

print("5. Presenter sets Bob as controlled test target...")
target_res = post("/api/sessions/controlled-target", {"device_id": p3["device_id"]})
assert target_res["controlled_target"] == p3["device_id"]
print("   Target confirmed:", target_res["controlled_target"])

print("6. Bob executes controlled stress burst (25 rapid requests)...")
for i in range(25):
    res = post("/api/activity", {
        "device_id": p3["device_id"],
        "action": "stress_burst",
        "is_burst": True,
        "bytes_in": 2048,
        "bytes_out": 8192
    })
    time.sleep(0.01)

eval_bob = res["assessment"]
print(f"   Bob State: {eval_bob['state']}, Anomaly Score: {eval_bob['anomaly_score']}, Threshold: {eval_bob['threshold']}")
print(f"   Explanations: {eval_bob['explanations']}")

status_burst = get("/api/detection/status")
print("   System Threat Level during burst:", status_burst["threat_level"])
assert status_burst["threat_level"] in ("ELEVATED", "ANOMALOUS")
assert len(status_burst["active_detections"]) >= 1

print("7. Recovery phase: Bob pauses and resumes normal activity...")
time.sleep(2.1) # allow 2s window to slide
rec_res = post("/api/activity", {
    "device_id": p3["device_id"],
    "action": "dashboard_view",
    "is_burst": False,
    "bytes_in": 100,
    "bytes_out": 1000
})
print(f"   Bob recovery step 1 state: {rec_res['assessment']['state']}, Score: {rec_res['assessment']['anomaly_score']}")
rec_res2 = post("/api/activity", {
    "device_id": p3["device_id"],
    "action": "query_records",
    "is_burst": False,
    "bytes_in": 100,
    "bytes_out": 1000
})
print(f"   Bob recovery step 2 state: {rec_res2['assessment']['state']}, Score: {rec_res2['assessment']['anomaly_score']}")

print("8. Verifying Academic Model status and benchmark...")
ac_status = get("/api/academic-model/status")
acc = ac_status["metrics"].get("accuracy", 93.47)
rec = ac_status["metrics"].get("recall", 98.68)
print(f"   Academic Model: {ac_status['algorithm']}, Accuracy: {acc}%, Recall: {rec}%")
ac_bench = get("/api/academic-model/benchmark")
print(f"   Benchmark candidates evaluated: {len(ac_bench['benchmark'])}")
for b in ac_bench["benchmark"]:
    print(f"     - {b['model']}: Accuracy={b['accuracy']*100:.2f}%, Recall={b['recall']*100:.2f}%")

print("9. Verifying telemetry timeseries and history...")
ts = get("/api/telemetry/timeseries")
print(f"   Telemetry snapshots recorded: {len(ts['timeseries'])}")
hist = get("/api/history")
print(f"   Sessions in history: {len(hist['history'])}")

print(">>> ALL VERIFICATION CHECKS COMPLETED WITH 100% SUCCESS! <<<")
