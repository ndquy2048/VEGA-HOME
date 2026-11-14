# VEGA HOME 1.0.0 — Hướng dẫn tiếng Việt

VEGA HOME là giao diện nhà thông minh dành cho **Home Assistant**, cho phép bố trí phòng, thiết bị và thao tác điều khiển trong giao diện tối ưu cho điện thoại, máy tính, máy tính bảng và màn hình cảm ứng.

## Tính năng

- Quản lý bố cục phòng và các thực thể Home Assistant.
- Điều khiển đèn, công tắc, quạt, điều hòa và các thiết bị tương thích.
- Hiển thị cảnh, tự động hóa, camera và trình phát nhạc theo khả năng của từng integration.
- Giao diện sáng/tối, đa ngôn ngữ và tùy chọn màn hình khóa.
- Đèn chỉ chỉnh độ sáng dùng một thanh kéo dọc và nút nguồn phía dưới; đèn chỉnh màu giữ giao diện đầy đủ.
- Có thể bật xác nhận trước khi tắt thiết bị hỗ trợ thao tác nguồn, kèm thông báo tùy chỉnh.
- Bảng cài đặt thiết bị và giao diện tự đóng khi không thao tác trong 60 giây; thay đổi thiết bị chưa lưu sẽ bị hủy, các thiết lập giao diện đã tự lưu vẫn được giữ.
- **Tự khóa sau → Không sử dụng**: vô hiệu hóa màn hình khóa trên trình duyệt/thiết bị đó. Nút Music mở popup của thiết bị đang phát nhạc thay vì đưa về màn hình khóa.

## Cài đặt

**Home Assistant 2026.11 trở lên:** khi repository đã công khai, vào **Cài đặt → Marketplace → Add from link**, nhập liên kết `https://github.com/ndquy2048/VEGA-HOME`, chọn cài đặt, sau đó thêm integration VEGA HOME trong **Thiết bị & dịch vụ** nếu Home Assistant chưa mở trình cài đặt tự động.

**Cài thủ công:** sao chép `custom_components/vega_home` vào `/config/custom_components/vega_home`, khởi động lại Home Assistant nếu cần, rồi tìm VEGA HOME trong mục thêm integration.

Trước khi cài đặt hoặc cập nhật, hãy sao lưu Home Assistant. Giao diện mở tại `/vega-home`. Việc lưu cấu hình chung yêu cầu tài khoản quản trị viên.

Xem [hướng dẫn tiếng Anh chi tiết](INSTALLATION.md), [câu hỏi thường gặp](FAQ.md), [quyền riêng tư](PRIVACY.md), và [giấy phép](../LICENSE).

## Lưu ý

- VEGA HOME là integration do cộng đồng phát triển, không phải sản phẩm chính thức của Home Assistant.
- Chỉ sử dụng những quyền mà giấy phép VEGA HOME và các giấy phép bên thứ ba cho phép.
- Không đăng token, địa chỉ nhà, IP nội bộ, bản sao lưu HA hoặc hình ảnh camera riêng tư khi báo lỗi công khai.
- Bản quyền phần mã nguồn gốc: © 2026 ndquy2048. VEGA HOME dùng giấy phép **Source Available — Free for Personal Use**; hãy đọc [LICENSE](../LICENSE) trước khi tải hoặc phân phối.
- Mức tương thích Home Assistant tối thiểu vẫn cần kiểm tra trước khi phát hành chính thức.
