from pathlib import Path

path = Path('/home/ubuntu/linkedin-jobs-page/app.js')
s = path.read_text()
row_start = s.index("rows.push('")
detail_marker = "+'<div class=\"job-detail-line\">'"
detail_start = s.index(detail_marker, row_start)
mobile_start = s.index("+'<div class=\"job-right-mobile\">'", detail_start)
mobile_end = s.index("+'</div>", mobile_start) + len("+'</div>")
mobile = s[mobile_start:mobile_end]
if s.count("+'<div class=\"job-right-mobile\">'") != 1:
    raise SystemExit('expected one mobile action block')
s = s[:mobile_start] + s[mobile_end:]
s = s[:detail_start] + mobile + s[detail_start:]
path.write_text(s)
print('moved mobile action block before detail line')
