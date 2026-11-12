"""Piper 음성 합성 작업자. 모델을 한 번만 불러 두고, 한 줄에 하나씩 JSON 요청을 처리한다.
입력: {"text": "...", "out": "/path/file.wav"}  출력: {"ok": true} 또는 {"ok": false, "error": "..."}
"""
import json
import sys
import wave

from piper import PiperVoice

voice = PiperVoice.load(sys.argv[1])
print(json.dumps({"ready": True}), flush=True)
for line in sys.stdin:
    try:
        req = json.loads(line)
        with wave.open(req["out"], "wb") as wf:
            voice.synthesize_wav(req["text"], wf)
        print(json.dumps({"ok": True}), flush=True)
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": str(e)}), flush=True)
