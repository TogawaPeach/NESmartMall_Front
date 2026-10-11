# 经纬智选首页视觉与交互核对

final result: passed

## 范围与状态

本次核对已实现的首页前端。用户确认后端尚未开发，并禁止假商品、假价格和模拟请求。因此参考图是商品成功状态，实现截图是商品服务未就绪的失败状态，不能据此声称验证了真实商品卡片或完成了接口对接。商品区域状态差异为明确的需求约束，不作为视觉偏差。

最新调整使用用户参考图中提取的商城 Logo，替换最初的文字标识；不显示智能导购、客服或演示商品说明。

## 证据

- 参考图：`/var/folders/n5/rtt2ql114yn85gp1bf9sqrmh0000gn/T/codex-clipboard-ffd74756-3e56-48df-8c29-4d8958832a25.png`，1487 × 1058 像素。
- 最终桌面：`/Users/lightfull/.codex/visualizations/2026/10/11/01a128d2-ef24-7e33-be65-89fd66013489/storefront-desktop-final.jpg`，1488 × 1058 像素，1488 × 1058 CSS viewport，devicePixelRatio 1。
- 全视图并排：`/Users/lightfull/.codex/visualizations/2026/10/11/01a128d2-ef24-7e33-be65-89fd66013489/storefront-comparison-final.png`。
- 导航聚焦并排：`/Users/lightfull/.codex/visualizations/2026/10/11/01a128d2-ef24-7e33-be65-89fd66013489/storefront-navigation-comparison-final.png`。
- 手机：`/Users/lightfull/.codex/visualizations/2026/10/11/01a128d2-ef24-7e33-be65-89fd66013489/storefront-mobile-final.jpg`，390 × 844 CSS viewport。
- 平板修复后：`/Users/lightfull/.codex/visualizations/2026/10/11/01a128d2-ef24-7e33-be65-89fd66013489/storefront-tablet-final.jpg`，768 × 1024 CSS viewport。
- 窄屏检查：320 × 740；中间断点检查：1201 × 900。DOM 检查页面 scrollWidth 等于 viewport 宽度，无横向页面溢出。

截图使用 Codex 内置浏览器。桌面截图来自生产构建 `http://127.0.0.1:4173/`，未显示开发工具浮层。参考图与实现仅差 1 像素宽度，均为单倍密度；并排时保持原始尺寸，无缩放补偿。

## 五项视觉核对

| 项目 | 结果 |
| --- | --- |
| 字体与层级 | 使用系统中文字体，桌面标题约 36px、分类 17px；主文字石墨色。品牌、标题、入口与辅助文字层级清晰。 |
| 间距与布局 | 桌面左右 50px、顶部 64px；导航 90px；标题区域至商品区域的留白与参考相近，商品区域保留 598px 高度。平板品牌独立一行，手机分类可横向滚动。 |
| 颜色与视觉变量 | 页面 #F7F8F8，卡片与导航白色，文字 #23282D / #646D75，边框 #E3E6E8，选中 #EDF2F5。轻微导航阴影，无横幅或渐变。 |
| 图片与图标 | 使用 Element Plus 图标；商品图只消费接口 URL，并通过 ElImage contain 展示；缺失/失败显示中性占位。无商品图生成或写死图片。成功卡片仍需后端数据验证。 |
| 文案与内容 | 标题、分类、搜索提示、页脚与需求一致；服务未就绪显示失败文案和重试，只有成功空数组才显示“暂无仪器”。 |

全视图用于核对整体比例、标题与页脚关系；聚焦导航并排用于核对分类字体、位置、选中背景、搜索及入口图标。手机与平板截图用于检查品牌遮挡、换行和横向溢出。

## 迭代历史

1. 初始桌面并排发现 [P2] 分类区域居中造成品牌后空隙过大，分类字号偏小。证据：`storefront-comparison.png`、`storefront-navigation-comparison.png`（同证据目录）。将分类改为限宽 700px、space-between，字号从 15px 调到 17px。最终导航并排确认修复。
2. 1201px DOM 检查发现 [P2] 分类子元素比容器宽 20px，侵入搜索前留白。将导航换行断点提高到 1279px。修复后 1201px 分类 clientWidth 与 scrollWidth 均为 937px，导航高度 136px，无挤压。
3. 平板截图发现 [P2] 768px 下分类向左挤到品牌文字。将独立品牌行与分类行的布局断点提高到 1023px。修复后的平板截图确认品牌与分类分行，品牌无遮挡，页面 scrollWidth 为 768px。
4. 代码复查发现输入法候选确认也会触发回车搜索。增加 KeyboardEvent 判断以及 isComposing / keyCode 229 检查；增加 Tooltip 的 focus 触发，键盘导航可看到“暂未开放”。最终类型检查、构建与 lint 通过。

独立视觉复核也未发现剩余 P0/P1/P2 问题。

## 交互与工程验证

- 回车及搜索图标提交；分类切换保留 RTK 关键词。
- 点击 Element Plus 清空图标后，关键词清空且 GNSS / RTK 仍选中。
- 重试按钮可执行，契约未配置时仍保持真实的服务未就绪失败状态。
- 搜索输入后的 Tab 可聚焦“我的订单”，并显示“我的订单 · 暂未开放”Tooltip；入口无页面跳转。
- 最终构建浏览器 error / warn 日志为空。
- `npm run type-check`、`npm run build`、`npm run lint`、`git diff --check` 通过。

## 剩余验证范围

待真实后端契约确定后验证成功商品卡片、真实空列表、持续请求中的骨架屏、图片失败、网络超时与业务异常、请求取消及结果先后顺序。当前仅通过代码复查确认这些分支与取消保护，不用 Mock 请求或商品填充来声称端到端通过。

没有阻止本次前端交付的 P0/P1/P2 问题。

## 后续导航调整：Logo 与紧凑分类容器

用户要求左侧使用参考图 Logo，并将全部到配件收拢、居中放在一个 box 内。本次仅调整导航组件与品牌图片：

- `src/assets/jingwei-logo.png` 直接提取最新参考图中的品牌标识，原始裁切范围 `(96, 84, 160, 140)`，64 × 56 像素；未重新绘制或生成替代图案。
- 分类外层保留可伸缩空间，内层 `.category-box` 使用紧凑 flex 排列和自动水平外边距居中；按钮水平 padding 从 18px 减至 14px，间隔 6px。
- 共用容器使用轻微边框、雾白背景及圆角；分类选中状态保留浅蓝灰色。
- 平板保持分类组居中；手机整体超宽时由外层横向滚动，自动外边距归零，首个选项可见。

新参考图：`/var/folders/n5/rtt2ql114yn85gp1bf9sqrmh0000gn/T/codex-clipboard-4654060a-5418-408d-af53-facf075bad61.png`，1487 × 1058 像素。

新证据均位于上述证据目录：

- `header-logo-desktop.jpg`：Chrome 当前页面，1470 × 667 CSS viewport；full-page 截图为 1470 × 1057 像素。设备 DPR 为 2，但浏览器 API 输出为 CSS 像素尺寸。
- `header-logo-comparison.png`：参考导航和实现导航上下并排，参考宽度按比例从 1487 归一为 1470px；比较保留 Logo、分类与搜索入口，忽略按原需求移除的智能导购。
- `header-logo-tablet.jpg`：768 × 1024 CSS viewport，full-page 768 × 1106 像素。
- `header-logo-mobile.jpg`：390 × 844 CSS viewport，full-page 390 × 873 像素。
- `header-logo-result.png`：最终导航局部，用于展示本次调整。

视觉检查确认 Logo 内容、比例、位置与参考一致；分类字体与颜色沿用原方案，选项间距明显缩小，共用圆角容器居中。桌面分类外层中心 x=599，内层中心 x≈599；平板两层中心均为 x=384。390px 及 320px 下页面 scrollWidth 等于 viewport 宽度，首个选项可见，可滚动到配件并正常切换选中状态。

最新 `npm run type-check`、`npm run build`、导航组件 ESLint、`git diff --check` 通过，Chrome error / warn 日志为空。无剩余 P0/P1/P2 问题，本次最终结果仍为 passed。

## 后续整体留白调整

按用户要求适度增加全页左右边距：桌面 50→64px，平板 32→40px，手机 16→20px。导航、商品区域与页脚共用首页外层 padding，因此同步对齐。

Chrome 检查 1488px、768px、320px 宽度下的实际左右 padding 分别为 64px、40px、20px，页面 scrollWidth 均等于 viewport 宽度。截图 `storefront-wider-margins-desktop.jpg` 与 `storefront-wider-margins-preview.jpg` 位于上述证据目录，分别保留整页和导航/标题区域证据。视觉检查无新增遮挡或挤压。`npm run build`（包含类型检查）和 `git diff --check` 通过，最终结果仍为 passed。

## 后续矢量 Logo 与导航外围留白调整

按用户要求，以三个 SVG 路径重绘品牌标识的菱形、斜线与山形几何轮廓，使用透明背景及石墨色填充。新增 `src/assets/jingwei-logo.svg`，替换并删除原 PNG 裁切资源；Logo 显示尺寸和可访问名称保留。

将“外围缩小到一半”落实为导航容器内边距减半：桌面 18px 36px → 9px 18px，中间断点 18px 28px → 9px 14px，平板及手机 20px → 10px。桌面最小高度同步降至 72px，实际含边框高度由 92px 降至 74px；阴影范围也减半。内部文字、分类按钮、搜索框及入口图标尺寸保留。

Chrome 实测 1470px、768px、320px 下页面无横向溢出，SVG 加载正常，桌面导航 padding 为 9px 18px，平板和手机为 10px。手机分类仍可横向滚动，搜索与入口按钮均保持可见。截图 `vector-logo-compact-navigation.png` 位于上述证据目录，保留导航及标题区域。`npm run build`（包含类型检查）、导航组件 ESLint 与 `git diff --check` 通过。

## 后续分类栏位置与调试入口调整

按用户标注，将商品分类从顶部导航移至原“测绘工具与配件”标题处。分类抽成 `ProductCategoryFilter.vue`，首页直接绑定原有 `category` 和 `selectCategory`；顶部仅保留 Logo、搜索及个人入口。标题保留屏幕阅读器可读的“商品分类”，手机分类栏横向滚动，“查看全部”排列在下一行右侧。

移除 `vite.config.ts` 中 Vue DevTools 插件的导入和注册，页面底部不再注入调试面板入口。保留已有依赖，避免无关的依赖变更。

Chrome 检查确认分类仅在 main 商品区中出现，顶部无分类，页面 DOM 中无 DevTools 按钮。桌面、768px 平板及 320px 手机无页面横向溢出；切换 GNSS / RTK 与配件保留已输入搜索词，手机能滚动至最后的配件并选中。检查结束后恢复空搜索词、全部分类及默认浏览器尺寸。截图 `product-category-relocated.png` 位于上述证据目录。`npm run build`（包含类型检查）、所修改 Vue 组件及 Vite 配置的 ESLint、`git diff --check` 通过。
