from pathlib import Path
p = Path('/home/ubuntu/linkedin-jobs-page/app.js')
s = p.read_text(encoding='utf-8')
mobile_start = "+'<div class=\"job-right-mobile\">'"
detail_start = '<div class="job-detail-line">'
assert s.count(mobile_start) == 1
assert s.count(detail_start) == 1
start = s.index(mobile_start)
end = s.index('</div>', start) + len('</div>')
mobile = s[start:end]
s = s[:start] + s[end:]
detail = s.index(detail_start)
s = s[:detail] + mobile + s[detail:]
p.write_text(s, encoding='utf-8')
print('moved mobile actions before detail line')
