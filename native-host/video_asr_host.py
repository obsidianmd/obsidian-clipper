#!/usr/bin/env python3
import base64
import json
import os
import re
import shutil
import struct
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

DEFAULT_ASR_BASE_URL = "https://openspeech.bytedance.com/api/v3/auc/bigmodel"
DEFAULT_ASR_CLUSTER = "volc.bigasr.auc"
DOUYIN_HEADERS = {
	"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
}
COMMON_BIN_DIRS = (
	"/opt/homebrew/bin",
	"/usr/local/bin",
	"/usr/bin",
	"/bin",
	"/Users/javaclimber/anaconda3/bin",
)


def sanitize_filename(value: str, fallback: str) -> str:
	name = re.sub(r'[\\/:*?"<>|]', "_", value.strip())
	name = re.sub(r"\s+", " ", name).strip(" .")
	return (name or fallback)[:120]


def send_message(message: Dict[str, Any]) -> None:
	data = json.dumps(message, ensure_ascii=False).encode("utf-8")
	sys.stdout.buffer.write(struct.pack("<I", len(data)))
	sys.stdout.buffer.write(data)
	sys.stdout.buffer.flush()


def read_message() -> Dict[str, Any]:
	raw_length = sys.stdin.buffer.read(4)
	if len(raw_length) != 4:
		raise RuntimeError("No native message received")
	message_length = struct.unpack("<I", raw_length)[0]
	return json.loads(sys.stdin.buffer.read(message_length).decode("utf-8"))


def progress(stage: str, message: str, percent: Optional[int] = None) -> None:
	payload: Dict[str, Any] = {"type": "progress", "stage": stage, "message": message}
	if percent is not None:
		payload["percent"] = percent
	send_message(payload)


def load_env() -> None:
	env_path = Path(__file__).resolve().parent / ".env"
	if not env_path.exists():
		return
	for line in env_path.read_text(encoding="utf-8").splitlines():
		line = line.strip()
		if not line or line.startswith("#") or "=" not in line:
			continue
		key, value = line.split("=", 1)
		os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def get_asr_settings(request: Dict[str, Any]) -> Dict[str, Any]:
	settings = request.get("asrSettings") or {}
	return {
		"provider": settings.get("provider") or "doubao",
		"baseUrl": settings.get("baseUrl") or os.getenv("bean.record.asr.base-url") or DEFAULT_ASR_BASE_URL,
		"appId": settings.get("appId") or os.getenv("bean.record.asr.app-id") or "",
		"accessToken": settings.get("accessToken") or os.getenv("bean.record.asr.access-token") or "",
		"cluster": settings.get("cluster") or os.getenv("bean.record.asr.cluster") or DEFAULT_ASR_CLUSTER,
		"downloadDir": settings.get("downloadDir") or "",
	}


def require_binary(name: str) -> str:
	path = shutil.which(name)
	if not path:
		for bin_dir in COMMON_BIN_DIRS:
			candidate = Path(bin_dir) / name
			if candidate.exists() and os.access(candidate, os.X_OK):
				return str(candidate)
		raise RuntimeError(f"缺少系统依赖: {name}")
	return path


def require_requests():
	try:
		import requests
	except ImportError as exc:
		raise RuntimeError("缺少 Python 依赖: requests，请运行 pip install requests") from exc
	return requests


def extract_first_url(text: str) -> str:
	urls = re.findall(r"https?://[^\s，。]+", text or "")
	return urls[0] if urls else ""


def first_text(*values: Any) -> str:
	for value in values:
		if value is None:
			continue
		text = str(value).strip()
		if text:
			return text
	return ""


def nested_get(data: Dict[str, Any], *keys: str) -> Any:
	current: Any = data
	for key in keys:
		if not isinstance(current, dict):
			return None
		current = current.get(key)
	return current


def extract_hashtags(item: Dict[str, Any], description: str) -> List[str]:
	tags: List[str] = []
	for extra in item.get("text_extra") or item.get("textExtras") or []:
		if not isinstance(extra, dict):
			continue
		name = first_text(extra.get("hashtag_name"), extra.get("hashtagName"), extra.get("name"))
		if name:
			tags.append(name)
	for match in re.findall(r"#([\w\u4e00-\u9fff-]+)", description):
		tags.append(match)
	return list(dict.fromkeys(tag.strip().lstrip("#") for tag in tags if tag.strip()))


def build_douyin_metadata(item: Dict[str, Any], video_id: str, video_url: str, source_url: str) -> Dict[str, str]:
	raw_title = first_text(item.get("desc"), item.get("description"), item.get("title"), nested_get(item, "share_info", "share_title"))
	author_data = item.get("author") or item.get("author_info") or item.get("authorInfo") or {}
	author = first_text(author_data.get("nickname"), author_data.get("unique_id"), author_data.get("short_id"), item.get("nickname"))
	create_time = item.get("create_time") or item.get("createTime") or item.get("create_time_ms") or ""
	if isinstance(create_time, str) and create_time.isdigit() and len(create_time) > 10:
		create_time = str(int(create_time) // 1000)
	elif isinstance(create_time, (int, float)) and create_time > 10_000_000_000:
		create_time = str(int(create_time) // 1000)
	tags = extract_hashtags(item, raw_title)
	for default_tag in ("text", "clippings"):
		if default_tag not in tags:
			tags.append(default_tag)
	display_title = raw_title or "抖音视频"
	title = sanitize_filename(display_title, f"douyin_{video_id}")
	return {
		"url": video_url,
		"title": title,
		"raw_title": display_title,
		"author": author,
		"description": raw_title,
		"published": str(create_time or ""),
		"tags": ",".join(tags),
		"video_id": video_id,
		"source_url": source_url,
	}


def parse_douyin_share(share_text: str) -> Dict[str, str]:
	requests = require_requests()
	share_url = extract_first_url(share_text)
	if not share_url:
		raise RuntimeError("未找到有效的抖音分享链接")

	response = requests.get(share_url, headers=DOUYIN_HEADERS, timeout=30)
	response.raise_for_status()
	video_id = response.url.split("?")[0].strip("/").split("/")[-1]
	if not video_id:
		raise RuntimeError("无法解析抖音视频 ID")

	page_url = f"https://www.iesdouyin.com/share/video/{video_id}"
	page_response = requests.get(page_url, headers=DOUYIN_HEADERS, timeout=30)
	page_response.raise_for_status()

	match = re.search(r"window\._ROUTER_DATA\s*=\s*(.*?)</script>", page_response.text, re.DOTALL)
	if not match:
		raise RuntimeError("从抖音 HTML 中解析视频信息失败")

	data = json.loads(match.group(1).strip())
	loader_data = data.get("loaderData") or {}
	if "video_(id)/page" in loader_data:
		video_info = loader_data["video_(id)/page"]["videoInfoRes"]
	elif "note_(id)/page" in loader_data:
		video_info = loader_data["note_(id)/page"]["videoInfoRes"]
	else:
		raise RuntimeError("无法从抖音 JSON 中解析视频信息")

	item = video_info["item_list"][0]
	video_url = item["video"]["play_addr"]["url_list"][0].replace("playwm", "play")
	return build_douyin_metadata(item, video_id, video_url, share_url)


def download_douyin_video(share_text: str, output_dir: Path) -> Tuple[Path, Dict[str, str]]:
	progress("parsing", "正在解析抖音分享链接。", 10)
	video_info = parse_douyin_share(share_text)
	send_message({
		"type": "metadata",
		"title": video_info.get("raw_title") or video_info.get("title") or "",
		"author": video_info.get("author") or "",
		"description": video_info.get("description") or "",
		"published": video_info.get("published") or "",
		"tags": video_info.get("tags") or "",
		"sourceUrl": video_info.get("source_url") or "",
	})
	requests = require_requests()
	video_path = output_dir / f"{video_info['title']}.mp4"

	progress("downloading", "正在下载抖音视频。", 25)
	with requests.get(video_info["url"], headers=DOUYIN_HEADERS, stream=True, timeout=60) as response:
		response.raise_for_status()
		with video_path.open("wb") as file:
			for chunk in response.iter_content(chunk_size=1024 * 1024):
				if chunk:
					file.write(chunk)

	if not video_path.exists() or video_path.stat().st_size == 0:
		raise RuntimeError("抖音视频下载失败，文件为空")
	return video_path, video_info


def download_with_ytdlp(url: str, output_dir: Path, platform: str, title: str = "") -> Path:
	ytdlp = require_binary("yt-dlp")
	base_name = sanitize_filename(title, f"{platform}_{int(time.time())}")
	output = output_dir / f"{base_name}.%(ext)s"
	progress("downloading", f"正在使用 yt-dlp 下载 {platform} 音视频。", 25)
	command = [
		ytdlp,
		"--no-playlist",
		"--no-warnings",
		"-f",
		"bestaudio/best",
		"-o",
		str(output),
		url,
	]
	result = subprocess.run(command, capture_output=True, text=True)
	if result.returncode != 0:
		raise RuntimeError((result.stderr or result.stdout or "yt-dlp 下载失败").strip())

	candidates = [path for path in output_dir.iterdir() if path.stem == base_name and path.is_file()]
	if not candidates:
		raise RuntimeError("yt-dlp 未生成可转录的音视频文件")
	return max(candidates, key=lambda path: path.stat().st_size)


def extract_audio(media_path: Path, temp_dir: Path) -> Path:
	ffmpeg = require_binary("ffmpeg")
	audio_path = temp_dir / "audio.mp3"
	progress("extracting_audio", "正在提取音频。", 45)
	command = [
		ffmpeg,
		"-y",
		"-i",
		str(media_path),
		"-vn",
		"-acodec",
		"libmp3lame",
		"-q:a",
		"0",
		str(audio_path),
	]
	result = subprocess.run(command, capture_output=True, text=True)
	if result.returncode != 0:
		raise RuntimeError((result.stderr or "FFmpeg 提取音频失败").strip())
	if not audio_path.exists() or audio_path.stat().st_size == 0:
		raise RuntimeError("音频提取失败，文件为空")
	return audio_path


def format_timestamp(milliseconds: int) -> str:
	total_seconds = max(0, int(milliseconds / 1000))
	hours = total_seconds // 3600
	minutes = (total_seconds % 3600) // 60
	seconds = total_seconds % 60
	if hours:
		return f"{hours:02d}:{minutes:02d}:{seconds:02d}"
	return f"{minutes:02d}:{seconds:02d}"


def split_sentences(text: str) -> List[str]:
	return [
		part.strip()
		for part in re.split(r"(?<=[。！？.!?])\s+", text.strip())
		if part.strip()
	]


def normalize_utterances(result: Dict[str, Any]) -> List[Dict[str, Any]]:
	utterances = result.get("utterances")
	if isinstance(utterances, list):
		return [
			item
			for item in utterances
			if isinstance(item, dict) and str(item.get("text") or "").strip()
		]
	return []


def get_utterance_speaker(item: Dict[str, Any]) -> str:
	for key in ("speaker", "speaker_id", "speakerId"):
		value = item.get(key)
		if value is not None and str(value).strip() != "":
			return str(value).strip()
	speaker_info = item.get("speaker_info") or item.get("speakerInfo") or item.get("additions")
	if isinstance(speaker_info, dict):
		for key in ("speaker", "speaker_id", "speakerId", "id"):
			value = speaker_info.get(key)
			if value is not None and str(value).strip() != "":
				return str(value).strip()
	return ""


def format_transcript(result: Dict[str, Any]) -> Tuple[str, List[Dict[str, Any]]]:
	utterances = normalize_utterances(result)
	if utterances:
		segments = []
		lines = []
		speaker_labels: Dict[str, str] = {}
		for item in utterances:
			text = str(item.get("text") or "").strip()
			start = int(item.get("start_time") or 0)
			end = int(item.get("end_time") or start)
			raw_speaker = get_utterance_speaker(item)
			speaker = ""
			if raw_speaker:
				speaker = speaker_labels.setdefault(raw_speaker, f"Speaker {len(speaker_labels) + 1}")
			segment = {"start": start / 1000, "end": end / 1000, "text": text}
			if speaker:
				segment["speaker"] = speaker
				lines.append(f"{format_timestamp(start)} · {speaker}: {text}")
			else:
				lines.append(f"{format_timestamp(start)} · {text}")
			segments.append(segment)
		return "\n".join(lines), segments

	text = str(result.get("text") or "").strip()
	sentences = split_sentences(text) or ([text] if text else [])
	segments = []
	lines = []
	for index, sentence in enumerate(sentences):
		start = index * 5000
		end = start + 5000
		segments.append({"start": start / 1000, "end": end / 1000, "text": sentence})
		lines.append(f"{format_timestamp(start)} · {sentence}")
	return "\n".join(lines), segments


def transcribe_audio(audio_path: Path, asr_settings: Dict[str, Any]) -> Tuple[str, List[Dict[str, Any]]]:
	requests = require_requests()
	load_env()
	if asr_settings.get("provider") != "doubao":
		raise RuntimeError(f"不支持的 ASR 提供商: {asr_settings.get('provider')}")
	app_id = asr_settings["appId"]
	access_token = asr_settings["accessToken"]
	api_base_url = asr_settings["baseUrl"].rstrip("/")
	cluster = asr_settings["cluster"]
	if not app_id or not access_token:
		raise RuntimeError("未设置豆包 ASR 配置，请在扩展设置中填写 App ID 和 Access Token")

	progress("transcribing", "正在调用火山豆包 ASR。", 70)
	audio_data = base64.b64encode(audio_path.read_bytes()).decode("utf-8")
	request_id = str(uuid.uuid4())
	headers = {
		"X-Api-App-Key": app_id,
		"X-Api-Access-Key": access_token,
		"X-Api-Resource-Id": cluster,
		"X-Api-Request-Id": request_id,
		"X-Api-Sequence": "-1",
	}
	payload = {
		"user": {"uid": app_id},
		"audio": {"data": audio_data, "format": audio_path.suffix.lstrip(".") or "mp3"},
		"request": {"model_name": "bigmodel", "show_utterances": True, "enable_speaker_info": True},
	}
	response = requests.post(f"{api_base_url}/recognize/flash", json=payload, headers=headers, timeout=120)
	if not response.ok:
		if response.status_code == 400 and "resourceId" in response.text:
			raise RuntimeError(
				f"火山 ASR HTTP 400: {response.text.strip()}。请检查设置里的豆包 Cluster / Resource ID 是否与你账号开通的模型一致。"
			)
		raise RuntimeError(f"火山 ASR HTTP {response.status_code}: {response.text.strip()}")
	status_code = response.headers.get("X-Api-Status-Code")
	if status_code and status_code != "20000000":
		raise RuntimeError(f"火山 ASR 识别失败: {status_code} {response.headers.get('X-Api-Message', '')}")

	result = response.json()
	recognition_result = result.get("result") or {}
	transcript_text, segments = format_transcript(recognition_result)
	if not transcript_text:
		raise RuntimeError("ASR 完成，但未返回字幕文本")
	return transcript_text, segments


def choose_download_dir() -> str:
	script = 'POSIX path of (choose folder with prompt "选择视频下载保存目录")'
	try:
		result = subprocess.run(
			["osascript", "-e", script],
			check=True,
			capture_output=True,
			text=True,
		)
	except subprocess.CalledProcessError as exc:
		message = (exc.stderr or exc.stdout or "").strip()
		if "User canceled" in message:
			return ""
		raise RuntimeError(f"选择目录失败: {message or exc}")
	return result.stdout.strip().rstrip("/")


def transcribe_video(request: Dict[str, Any]) -> Dict[str, Any]:
	platform = request.get("platform")
	url = request.get("url") or ""
	share_text = request.get("shareText") or ""
	request_title = request.get("title") or ""
	load_env()
	asr_settings = get_asr_settings(request)
	download_dir = str(asr_settings.get("downloadDir") or "").strip()
	base_dir = Path(download_dir).expanduser() if download_dir else Path(tempfile.gettempdir()) / "obsidian-clipper-video-asr"
	output_dir = base_dir / str(platform or "video")
	output_dir.mkdir(parents=True, exist_ok=True)
	audio_dir = Path(tempfile.mkdtemp(prefix="audio-", dir=str(output_dir)))
	media_path: Optional[Path] = None
	audio_path: Optional[Path] = None
	metadata: Dict[str, str] = {}

	try:
		progress("checking", "正在检查本地转录依赖。", 5)
		require_binary("ffmpeg")
		if platform in ("youtube", "bilibili"):
			require_binary("yt-dlp")
		require_requests()

		if platform == "douyin":
			media_path, metadata = download_douyin_video(share_text or url, output_dir)
		elif platform in ("youtube", "bilibili"):
			if not url:
				raise RuntimeError("缺少视频链接")
			media_path = download_with_ytdlp(url, output_dir, platform, request_title)
		else:
			raise RuntimeError(f"不支持的平台: {platform}")

		audio_path = extract_audio(media_path, audio_dir)
		transcript_text, segments = transcribe_audio(audio_path, asr_settings)
		progress("cleanup", "正在清理临时文件。", 95)
		return {
			"type": "result",
			"ok": True,
			"transcriptText": transcript_text,
			"segments": segments,
			"title": metadata.get("raw_title") or metadata.get("title") or "",
			"author": metadata.get("author") or "",
			"description": metadata.get("description") or "",
			"published": metadata.get("published") or "",
			"tags": metadata.get("tags") or "",
			"sourceUrl": metadata.get("source_url") or share_text or url,
		}
	finally:
		shutil.rmtree(audio_dir, ignore_errors=True)
		if media_path and media_path.exists():
			try:
				media_path.unlink()
			except OSError:
				pass


def main() -> None:
	try:
		request = read_message()
		if request.get("type") == "choose-download-dir":
			path = choose_download_dir()
			send_message({"type": "result", "ok": True, "path": path})
			return
		if request.get("type") != "transcribe-video":
			raise RuntimeError("Unsupported native host request")
		result = transcribe_video(request)
		progress("done", "转录完成。", 100)
		send_message(result)
	except Exception as exc:
		send_message({"type": "result", "ok": False, "error": str(exc)})


if __name__ == "__main__":
	main()
