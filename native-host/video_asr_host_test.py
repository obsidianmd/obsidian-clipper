import importlib.util
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("video_asr_host.py")
SPEC = importlib.util.spec_from_file_location("video_asr_host", MODULE_PATH)
video_asr_host = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(video_asr_host)


class FakeResponse:
	def __init__(self):
		self.ok = True
		self.status_code = 200
		self.text = ""
		self.headers = {"X-Api-Status-Code": "20000000"}

	def json(self):
		return {
			"result": {
				"utterances": [
					{"start_time": 0, "end_time": 1200, "text": "你好。", "speaker_id": "0"},
					{"start_time": 1300, "end_time": 2400, "text": "欢迎。", "speaker_id": "1"},
				]
			}
		}


class FakeRequests:
	def __init__(self):
		self.payload = None

	def post(self, url, json, headers, timeout):
		self.payload = json
		return FakeResponse()


class VideoAsrHostTest(unittest.TestCase):
	def test_format_transcript_includes_speaker_labels(self):
		transcript, segments = video_asr_host.format_transcript({
			"utterances": [
				{"start_time": 0, "end_time": 1000, "text": "第一句", "speaker_id": "0"},
				{"start_time": 1200, "end_time": 2000, "text": "第二句", "speaker_id": "0"},
				{"start_time": 2200, "end_time": 3000, "text": "第三句", "speaker_id": "1"},
			]
		})

		self.assertEqual(transcript, "00:00 · Speaker 1: 第一句\n00:01 · Speaker 1: 第二句\n00:02 · Speaker 2: 第三句")
		self.assertEqual(segments[0]["speaker"], "Speaker 1")
		self.assertEqual(segments[1]["speaker"], "Speaker 1")
		self.assertEqual(segments[2]["speaker"], "Speaker 2")

	def test_format_transcript_keeps_old_format_without_speaker(self):
		transcript, segments = video_asr_host.format_transcript({
			"utterances": [
				{"start_time": 0, "end_time": 1000, "text": "没有说话人"}
			]
		})

		self.assertEqual(transcript, "00:00 · 没有说话人")
		self.assertNotIn("speaker", segments[0])

	def test_format_transcript_reads_additions_speaker(self):
		transcript, segments = video_asr_host.format_transcript({
			"utterances": [
				{"start_time": 0, "end_time": 1000, "text": "第一句", "additions": {"speaker": "1"}},
				{"start_time": 1200, "end_time": 2000, "text": "第二句", "additions": {"speaker": "2"}},
			]
		})

		self.assertEqual(transcript, "00:00 · Speaker 1: 第一句\n00:01 · Speaker 2: 第二句")
		self.assertEqual(segments[0]["speaker"], "Speaker 1")
		self.assertEqual(segments[1]["speaker"], "Speaker 2")

	def test_transcribe_audio_requests_speaker_utterances(self):
		fake_requests = FakeRequests()
		original_require_requests = video_asr_host.require_requests
		original_load_env = video_asr_host.load_env
		original_progress = video_asr_host.progress
		video_asr_host.require_requests = lambda: fake_requests
		video_asr_host.load_env = lambda: None
		video_asr_host.progress = lambda *args, **kwargs: None
		try:
			with tempfile.TemporaryDirectory() as temp_dir:
				audio_path = Path(temp_dir) / "audio.mp3"
				audio_path.write_bytes(b"fake audio")
				transcript, segments = video_asr_host.transcribe_audio(audio_path, {
					"provider": "doubao",
					"baseUrl": "https://example.com",
					"appId": "app",
					"accessToken": "token",
					"cluster": "cluster",
				})
		finally:
			video_asr_host.require_requests = original_require_requests
			video_asr_host.load_env = original_load_env
			video_asr_host.progress = original_progress

		self.assertEqual(fake_requests.payload["request"]["show_utterances"], True)
		self.assertEqual(fake_requests.payload["request"]["enable_speaker_info"], True)
		self.assertIn("Speaker 1", transcript)
		self.assertEqual(segments[1]["speaker"], "Speaker 2")


if __name__ == "__main__":
	unittest.main()
