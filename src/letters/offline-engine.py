"""通过标准库直接复用上游引擎；无配置扫描、网络或独立记忆库。"""
import importlib.util
import json
import sys
from datetime import datetime

sys.stdout.reconfigure(encoding="utf-8")
with open(sys.argv[1], encoding="utf-8") as stream:
    data = json.load(stream)
spec = importlib.util.spec_from_file_location("linli_upstream_engine", data["engine"])
engine = importlib.util.module_from_spec(spec)
spec.loader.exec_module(engine)
# 上游这两份模板假定首信/停服和过去经历；这些事实不能由模板补造。
engine.FIRST = engine.FIRST.replace("其实这是我第一次写信给你。我是林离。", "我是林离。")
engine.FAREWELL = ("你的告别，我读到了。\n\n有些话写到这里会停一下，我也不急着把停顿填满。"
                   "你写下的这一刻，就留在这封信里。\n\n你想说的时候可以再写，不必为这一次告别补一个承诺。\n\n—— 林离")
now = datetime.fromisoformat(data["localTime"])
result = engine.respond(data["prompt"], now=now, memory_echo=data.get("memoryEcho") or None)
result["topics"] = engine.analyze(data["prompt"])["topics"]
if data.get("displayName"):
    result["reply"] = data["displayName"] + "，\n\n" + result["reply"]
print(json.dumps(result, ensure_ascii=False))
