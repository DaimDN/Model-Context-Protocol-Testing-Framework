import React, { useState, useEffect, useRef, useCallback } from "react";
import { io } from "socket.io-client";
import mermaid from "mermaid";
import {
	FaEllipsisH,
	FaRobot,
	FaUser,
	FaBell,
	FaQuestionCircle,
	FaChevronDown,
	FaExternalLinkAlt,
	FaMousePointer,
	FaKeyboard,
	FaBolt,
	FaDatabase,
	FaCopy,
	FaGlobe,
	FaExpand,
	FaPaperclip,
	FaPlug,
	FaHistory,
	FaCog,
	FaKey,
	FaCircle,
	FaUsersCog,
	FaChartLine,
	FaBug,
	FaProjectDiagram,
	FaFlask,
	FaEye,
	FaTrashAlt,
	FaPlus,
	FaSyncAlt,
	FaCircleNotch,
	FaInfoCircle,
	FaCheckCircle,
	FaExclamationCircle,
	FaTimes,
	FaCode,
	FaSitemap,
} from "react-icons/fa";

mermaid.initialize({
	startOnLoad: true,
	theme: "default",
	securityLevel: "loose",
	flowchart: {
		curve: "basis",
	},
});

const Modal = ({
	isOpen,
	onClose,
	title,
	children,
	large = false,
	fullScreen = false,
}) => {
	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50 p-4">
			<div
				className={`bg-white rounded-lg shadow-xl relative transform transition-all flex flex-col
                ${
									fullScreen
										? "w-[98vw] h-[98vh]"
										: large
										  ? "w-[90vw] h-[90vh]"
										  : "max-w-3xl w-full h-auto max-h-[90vh]"
								}`}>
				<div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
					<h3 className="text-xl font-semibold text-gray-900">{title}</h3>
					<button
						onClick={onClose}
						className="text-gray-400 hover:text-gray-600 transition-colors">
						<FaTimes className="text-xl" />
					</button>
				</div>
				<div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
					{children}
				</div>
			</div>
		</div>
	);
};

const AIWebAutomation = () => {
	const [isConnected, setIsConnected] = useState(false);
	const [isProcessing, setIsProcessing] = useState(false);
	const [currentPage, setCurrentPage] = useState(null);
	const [chatMessages, setChatMessages] = useState([
		{
			id: 1,
			type: "ai",
			content:
				'Welcome to NeuraFlow AI Automation. I can help you automate web tasks, extract data, and generate test scripts. Here are some things you can ask me:\n\n• "Open google.com and search for AI trends"\n• "Click the login button and fill the form"\n• "Extract all product prices from this page"\n• "Generate a Playwright test for this workflow"',
			timestamp: new Date(),
		},
	]);
	const [chatInput, setChatInput] = useState("");
	const [activityLog, setActivityLog] = useState([
		{
			id: 1,
			type: "info",
			message: "System initialized",
			details: "NeuraFlow AI automation session started",
			timestamp: new Date(),
		},
	]);
	const [testCase, setTestCase] = useState(
		"No test case generated yet. Interact with the AI to generate a test script.",
	);
	const [sessionStartTime] = useState(new Date());
	const [actionCount, setActionCount] = useState(0);
	const [latency, setLatency] = useState(null);
	const [mermaidDiagram, setMermaidDiagram] = useState("");

	const chatMessagesEndRef = useRef(null);
	const socketRef = useRef(null);
	const mermaidContainerRef = useRef(null);
	const mermaidFullscreenContainerRef = useRef(null);

	const [isTestCaseModalOpen, setIsTestCaseModalOpen] = useState(false);
	const [isActivityLogModalOpen, setIsActivityLogModalOpen] = useState(false);
	const [isSessionInfoModalOpen, setIsSessionInfoModalOpen] = useState(false);
	const [isCurrentPageModalOpen, setIsCurrentPageModalOpen] = useState(false);
	const [isPageElementsModalOpen, setIsPageElementsModalOpen] = useState(false);
	const [isMermaidFullscreenModalOpen, setIsMermaidFullscreenModalOpen] =
		useState(false);

	const addActivityLog = useCallback((message, type = "info") => {
		const newLog = {
			id: Date.now(),
			type,
			message,
			details:
				type === "error"
					? "Error occurred"
					: type === "success"
					  ? "Operation successful"
					  : "System notification",
			timestamp: new Date(),
		};
		setActivityLog((prev) => [...prev.slice(-8), newLog]);
	}, []);

	const addMessage = useCallback((content, type) => {
		const newMessage = {
			id: Date.now(),
			type,
			content,
			timestamp: new Date(),
		};
		setChatMessages((prev) => [...prev, newMessage]);
	}, []);

	const generateMermaidGraph = useCallback((node, parentId = "") => {
		if (!node) return "";

		let graph = "";
		const nodeId = `${node.tag}_${Math.random().toString(36).substring(2, 9)}`;

		let nodeLabel = node.tag;
		if (node.id) nodeLabel += `(#${node.id})`;
		else if (node.class) nodeLabel += `(.${node.class.split(" ")[0]})`;
		if (node.text && node.text.trim().length > 0) {
			const cleanedText = node.text
				.trim()
				.replace(/["'`]/g, "")
				.substring(0, 20);
			nodeLabel += `[${cleanedText}${
				node.text.trim().length > 20 ? "..." : ""
			}]`;
		}

		graph += `${nodeId}("${nodeLabel}")\n`;

		if (parentId) {
			graph += `${parentId} --> ${nodeId}\n`;
		}

		if (node.children && node.children.length > 0) {
			node.children.forEach((child) => {
				graph += generateMermaidGraph(child, nodeId);
			});
		}
		return graph;
	}, []);

	useEffect(() => {
		const socket = io("http://localhost:3000", {
			reconnection: true,
			reconnectionAttempts: 5,
			reconnectionDelay: 1000,
			timeout: 20000,
		});
		socketRef.current = socket;

		socket.on("connect", () => {
			setIsConnected(true);
			addActivityLog("Connected to NeuraFlow AI server", "success");
			setTimeout(() => {
				const simulatedLatency = Math.floor(Math.random() * 100) + 20;
				setLatency(simulatedLatency);
			}, 500);
		});

		socket.on("disconnect", () => {
			setIsConnected(false);
			addActivityLog("Disconnected from server", "error");
			setLatency(null);
			setCurrentPage(null);
			setMermaidDiagram("");
		});

		socket.on("connect_error", (error) => {
			addActivityLog(`Connection error: ${error.message}`, "error");
			setLatency(null);
		});

		const handleStatusUpdate = (data) => {
			const { message, type } = data;
			addMessage(message, `status-${type}`);
			addActivityLog(message, type);

			if (type === "success" || type === "error") {
				setTimeout(() => {
					setIsProcessing(false);
				}, 1000);
			}
		};

		const displayExtractedData = (data) => {
			let content = `✅ Extracted ${data.length} items:\n\n`;
			data.forEach((item, index) => {
				content += `${index + 1}. ${item.text}`;
				if (item.href) {
					content += ` (${item.href})`;
				}
				content += "\n";
			});
			addMessage(content, "ai");
		};

		const handleDataUpdate = (data) => {
			const { type, data: updateData } = data;
			switch (type) {
				case "page_structure":
					const simulatedDomTree = {
						tag: "html",
						children: [
							{
								tag: "head",
								children: [
									{ tag: "title", text: updateData.title || "Page Title" },
								],
							},
							{
								tag: "body",
								children: [
									{
										tag: "div",
										id: "header",
										children: [
											{ tag: "img", class: "logo", text: "Logo" },
											{
												tag: "nav",
												children: [
													{
														tag: "ul",
														children: [
															{
																tag: "li",
																children: [
																	{ tag: "a", text: "Home", href: "/" },
																],
															},
															{
																tag: "li",
																children: [
																	{
																		tag: "a",
																		text: "Products",
																		href: "/products",
																	},
																],
															},
															{
																tag: "li",
																children: [
																	{ tag: "a", text: "About", href: "/about" },
																],
															},
														],
													},
												],
											},
										],
									},
									{
										tag: "div",
										id: "main-content",
										children: [
											{
												tag: "h1",
												text: "Welcome to " + (updateData.title || "the page"),
											},
											{
												tag: "p",
												text: "This is a dynamically generated DOM structure for visualization.",
											},
											...updateData.buttons.map((b, i) => ({
												tag: "button",
												text: b.text || `Button ${i + 1}`,
												selector: b.selector,
											})),
											{
												tag: "div",
												class: "product-list",
												children: [
													{
														tag: "div",
														class: "product-item",
														children: [
															{ tag: "h2", text: "Product A" },
															{ tag: "span", class: "price", text: "$19.99" },
														],
													},
													{
														tag: "div",
														class: "product-item",
														children: [
															{ tag: "h2", text: "Product B" },
															{ tag: "span", class: "price", text: "$29.99" },
														],
													},
												],
											},
										],
									},
									{
										tag: "footer",
										children: [{ tag: "p", text: "© 2025 NeuraFlow" }],
									},
								],
							},
						],
					};
					const updatedPageData = { ...updateData, domTree: simulatedDomTree };
					setCurrentPage(updatedPageData);
					addActivityLog(`Page loaded: ${updateData.title}`, "info");

					if (simulatedDomTree) {
						const graphDefinition = `graph TD\n${generateMermaidGraph(
							simulatedDomTree,
						)}`;
						setMermaidDiagram(graphDefinition);
					} else {
						setMermaidDiagram("");
					}
					break;
				case "extracted_data":
					displayExtractedData(updateData);
					break;
				default:
					console.log("Unknown data update type:", type, updateData);
			}
		};

		socket.on("status_update", handleStatusUpdate);
		socket.on("data_update", handleDataUpdate);
		socket.on("test_case", (data) => {
			setTestCase(data.testCode);
			addActivityLog("Playwright test case generated", "success");
			setIsTestCaseModalOpen(true);
		});

		return () => {
			socket.off("status_update", handleStatusUpdate);
			socket.off("data_update", handleDataUpdate);
			socket.off("test_case");
			socket.disconnect();
		};
	}, [addActivityLog, addMessage, generateMermaidGraph]);

	const renderMermaidDiagram = useCallback(
		(containerRef) => {
			if (mermaidDiagram && containerRef.current) {
				try {
					containerRef.current.innerHTML = ""; // Clear previous SVG
					mermaid
						.render("mermaidSvg", mermaidDiagram)
						.then(({ svg }) => {
							if (containerRef.current) {
								containerRef.current.innerHTML = svg;
							}
						})
						.catch((error) => {
							console.error("Mermaid rendering failed:", error);
							if (containerRef.current) {
								containerRef.current.innerHTML =
									'<p class="text-red-500">Failed to render DOM diagram. Check console for errors.</p>';
							}
						});
				} catch (e) {
					console.error("Error setting Mermaid diagram:", e);
					if (containerRef.current) {
						containerRef.current.innerHTML =
							'<p class="text-red-500">Error preparing DOM diagram.</p>';
					}
				}
			}
		},
		[mermaidDiagram],
	);

	useEffect(() => {
		if (isPageElementsModalOpen) {
			renderMermaidDiagram(mermaidContainerRef);
		}
	}, [isPageElementsModalOpen, renderMermaidDiagram]);

	useEffect(() => {
		if (isMermaidFullscreenModalOpen) {
			renderMermaidDiagram(mermaidFullscreenContainerRef);
		}
	}, [isMermaidFullscreenModalOpen, renderMermaidDiagram]);

	useEffect(() => {
		chatMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [chatMessages]);

	const sendMessage = () => {
		const message = chatInput.trim();
		if (!message || !isConnected || isProcessing) return;

		addMessage(message, "user");
		setChatInput("");
		setIsProcessing(true);
		setActionCount((prev) => prev + 1);

		socketRef.current.emit("user_message", { message });
		addActivityLog(`Command sent: "${message}"`, "info");
	};

	const generateTest = () => {
		if (isConnected) {
			socketRef.current.emit("generate_test");
			addActivityLog("Generating Playwright test case...", "info");
		}
	};

	const copyTestCase = () => {
		navigator.clipboard.writeText(testCase);
		addActivityLog("Test case copied to clipboard", "success");
	};

	const insertExample = (command) => {
		setChatInput(command);
	};

	const formatTime = (date) => {
		return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
	};

	const formatDuration = (startTime) => {
		const now = new Date();
		const diff = Math.floor((now - startTime) / 1000);
		const hours = Math.floor(diff / 3600);
		const minutes = Math.floor((diff % 3600) / 60);
		const seconds = diff % 60;
		return `${hours.toString().padStart(2, "0")}:${minutes
			.toString()
			.padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
	};

	const getStatusColor = () => {
		if (!isConnected) return "bg-red-500";
		return "bg-green-500";
	};

	const getLatencyColor = () => {
		if (latency === null) return "bg-gray-400";
		if (latency < 50) return "bg-green-500";
		if (latency < 150) return "bg-yellow-500";
		return "bg-red-500";
	};

	const getLatencyWidth = () => {
		if (latency === null) return "0%";
		return `${Math.min((latency / 200) * 100, 100)}%`;
	};

	const getActivityIcon = (type) => {
		switch (type) {
			case "success":
				return <FaCheckCircle className="text-green-500" />;
			case "error":
				return <FaExclamationCircle className="text-red-500" />;
			case "warning":
				return <FaExclamationCircle className="text-yellow-500" />;
			default:
				return <FaInfoCircle className="text-blue-500" />;
		}
	};

	const endSession = () => {
		if (socketRef.current && isConnected) {
			socketRef.current.disconnect();
			addActivityLog("Session manually ended.", "info");
			setCurrentPage(null);
			setTestCase(
				"No test case generated yet. Interact with the AI to generate a test script.",
			);
			setChatMessages([
				{
					id: Date.now(),
					type: "ai",
					content:
						'Session ended. Welcome to NeuraFlow AI Automation. I can help you automate web tasks, extract data, and generate test scripts. Here are some things you can ask me:\n\n• "Open google.com and search for AI trends"\n• "Click the login button and fill the form"\n• "Extract all product prices from this page"\n• "Generate a Playwright test for this workflow"',
					timestamp: new Date(),
				},
			]);
			setActionCount(0);
			setMermaidDiagram("");
		}
	};

	return (
		<div className="bg-gray-50 flex flex-col font-sans antialiased h-screen overflow-hidden">
			<header className="bg-white shadow-sm border-b border-gray-200 fixed w-full z-30">
				<div className="w-full px-4 sm:px-6 lg:px-8 py-3">
					<div className="flex items-center justify-between">
						<div className="flex items-center space-x-3">
							<div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center shadow-md">
								<FaRobot className="text-white text-xl" />
							</div>
							<div>
								<h1 className="text-xl font-bold text-gray-900 flex items-center">
									<span className="bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">
										NeuraFlow
									</span>
									<span className="bg-blue-100 text-blue-700 ml-2 font-medium text-xs px-2 py-0.5 rounded-full shadow-sm">
										PRO
									</span>
								</h1>
								<p className="text-xs text-gray-500 mt-0.5">
									AI-Powered Web Automation
								</p>
							</div>
						</div>
						<div className="flex items-center space-x-4">
							<button
								className="px-3 py-1.5 bg-red-100 text-red-700 rounded-full text-sm font-medium hover:bg-red-200 transition-colors flex items-center space-x-2"
								onClick={endSession}
								disabled={!isConnected}>
								<FaTrashAlt />
								<span>End Session</span>
							</button>

							<button
								onClick={() => setIsCurrentPageModalOpen(true)}
								className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-full text-sm font-medium hover:bg-blue-200 transition-colors flex items-center space-x-2"
								disabled={!currentPage}>
								<FaGlobe />
								<span>Current Page</span>
							</button>

							<button
								onClick={() => setIsPageElementsModalOpen(true)}
								className="px-3 py-1.5 bg-teal-100 text-teal-700 rounded-full text-sm font-medium hover:bg-teal-200 transition-colors flex items-center space-x-2"
								disabled={!currentPage}>
								<FaSitemap />
								<span>DOM Tree</span>
							</button>

							<div className="hidden sm:flex items-center space-x-2 bg-gray-100 px-3 py-1.5 rounded-full border border-gray-200">
								<div
									className={`w-2.5 h-2.5 ${getStatusColor()} rounded-full ${
										!isConnected ? "animate-pulse" : ""
									}`}
								/>
								<span className="text-sm font-medium text-gray-700">
									{isConnected ? "Connected" : "Connecting..."}
								</span>
							</div>
							<button className="p-2 text-gray-500 hover:text-gray-700 transition-colors duration-200 relative">
								<FaBell className="text-xl" />
								<span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border border-white animate-bounce"></span>
							</button>
							<button className="p-2 text-gray-500 hover:text-gray-700 transition-colors duration-200">
								<FaQuestionCircle className="text-xl" />
							</button>
							<div className="relative">
								<button className="flex items-center space-x-2 focus:outline-none bg-gray-100 px-3 py-1.5 rounded-full hover:bg-gray-200 transition-colors">
									<div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white font-semibold text-sm">
										UA
									</div>
									<span className="text-sm font-medium text-gray-700 hidden md:block">
										User Admin
									</span>
									<FaChevronDown className="text-xs text-gray-500" />
								</button>
							</div>
						</div>
					</div>
				</div>
			</header>

			<main className="flex-1 flex pt-16 h-full overflow-hidden">
				<div className="w-full h-full flex flex-col lg:flex-row gap-6 p-4">
					<section className="flex flex-col space-y-8 flex-1 h-full">
						<div className="bg-white rounded-xl shadow-lg border border-gray-200 flex-1 flex flex-col h-full">
							<div className="flex-1 overflow-y-auto p-12 space-y-6 custom-scrollbar">
								{chatMessages.map((message) => (
									<div
										key={message.id}
										className={`flex items-end space-x-9 ${
											message.type === "user" ? "justify-end" : "justify-start"
										} animate-fadeIn`}>
										{message.type !== "user" && (
											<div
												className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 shadow-md ${
													message.type.startsWith("status-")
														? "bg-gray-100 border border-gray-200"
														: "bg-gradient-to-br from-blue-500 to-purple-500"
												}`}>
												{message.type.startsWith("status-") ? (
													<FaInfoCircle
														className={`text-base ${
															message.type === "status-error"
																? "text-red-500"
																: message.type === "status-success"
																  ? "text-green-500"
																  : message.type === "status-warning"
																    ? "text-yellow-500"
																    : "text-blue-500"
														}`}
													/>
												) : (
													<FaRobot className="text-white text-base" />
												)}
											</div>
										)}
										<div
											className={`max-w-xl rounded-xl p-4 shadow-sm ${
												message.type === "user"
													? "bg-blue-600 text-white rounded-br-none"
													: message.type.startsWith("status-")
													  ? message.type === "status-error"
															? "bg-red-100 border border-red-200 text-red-800"
															: message.type === "status-success"
															  ? "bg-green-100 border border-green-200 text-green-800"
															  : message.type === "status-warning"
															    ? "bg-yellow-100 border border-yellow-200 text-yellow-800"
															    : "bg-blue-100 border border-blue-200 text-blue-800"
													  : "bg-gray-100 text-gray-800 rounded-bl-none"
											}`}>
											<div className="flex items-center justify-between mb-1">
												<p
													className={`font-semibold ${
														message.type === "user" ? "text-white" : ""
													}`}>
													{message.type === "user"
														? "You"
														: message.type.startsWith("status-")
														  ? "System Update"
														  : "NeuraFlow AI"}
												</p>
												<span
													className={`text-xs ${
														message.type === "user"
															? "text-blue-200"
															: "text-gray-500"
													}`}>
													{formatTime(message.timestamp)}
												</span>
											</div>
											<p className="whitespace-pre-wrap break-all">
												{message.content}
											</p>
										</div>
										{message.type === "user" && (
											<div className="w-9 h-9 bg-gray-700 rounded-full flex items-center justify-center flex-shrink-0 shadow-md">
												<FaUser className="text-white text-base" />
											</div>
										)}
									</div>
								))}
								<div ref={chatMessagesEndRef} />
							</div>
							<div className="border-t border-gray-200 -pt-10 p-6 bg-gray-50">
								<div className="flex space-x-3">
									<div className="flex-1 relative">
										<textarea
											value={chatInput}
											onChange={(e) => setChatInput(e.target.value)}
											onKeyPress={(e) => {
												if (e.key === "Enter" && !e.shiftKey) {
													e.preventDefault();
													sendMessage();
												}
											}}
											rows="3"
											className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 placeholder-gray-500 resize-none shadow-sm text-gray-800"
											placeholder="Type your automation command or question..."
											maxLength="500"></textarea>
										<div className="absolute bottom-3 right-3 flex items-center space-x-2">
											<button className="text-gray-400 hover:text-gray-600 transition-colors">
												<FaPaperclip className="text-lg" />
											</button>
											<span
												className={`text-xs ${
													chatInput.length > 400
														? "text-yellow-600"
														: chatInput.length >= 500
														  ? "text-red-600"
														  : "text-gray-500"
												}`}>
												{chatInput.length}/500
											</span>
										</div>
									</div>
									<div className="flex flex-col space-y-3">
										<button
											onClick={sendMessage}
											disabled={
												!chatInput.trim() || !isConnected || isProcessing
											}
											className={`min-w-[100px] px-5 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed font-semibold flex items-center justify-center text-sm shadow-md`}>
											{isProcessing ? (
												<FaCircleNotch className="animate-spin mr-2" />
											) : null}
											<span>Send</span>
										</button>
										<button
											onClick={generateTest}
											disabled={!isConnected}
											className="min-w-[100px] px-5 py-3 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-lg hover:from-purple-700 hover:to-purple-800 focus:ring-2 focus:ring-purple-600 focus:ring-offset-2 transition-all duration-200 font-semibold flex items-center justify-center text-sm shadow-md disabled:opacity-60 disabled:cursor-not-allowed">
											<FaFlask className="mr-2 text-base" />
											<span>Generate Test</span>
										</button>
									</div>
								</div>
								<div className=" border-t border-gray-100">
									<h4 className="text-sm font-semibold text-gray-700 mb-2">
										Quick Examples:
									</h4>
									<div className="flex flex-wrap gap-2">
										<button
											onClick={() =>
												insertExample(
													'Open "amazon.com" and search for "gaming keyboard"',
												)
											}
											className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs hover:bg-gray-200 transition-colors border border-gray-200">
											Open & Search
										</button>
										<button
											onClick={() =>
												insertExample(
													'Click the button with text "Add to Cart"',
												)
											}
											className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs hover:bg-gray-200 transition-colors border border-gray-200">
											Click Button
										</button>
										<button
											onClick={() =>
												insertExample(
													"Extract all product names and prices from this page",
												)
											}
											className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs hover:bg-gray-200 transition-colors border border-gray-200">
											Extract Data
										</button>
										<button
											onClick={() =>
												insertExample(
													'Fill the login form with username "testuser" and password "pass123"',
												)
											}
											className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs hover:bg-gray-200 transition-colors border border-gray-200">
											Fill Form
										</button>
									</div>
								</div>
							</div>
						</div>
					</section>

					<aside className="flex flex-col space-y-6 lg:w-96 w-full lg:flex-shrink-0">
						<div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
							<div className="flex items-center justify-between mb-4">
								<h3 className="text-lg font-semibold text-gray-900 flex items-center">
									<FaPlug className="text-blue-500 mr-2 text-xl" />
									Connection Status
								</h3>
								<div className="flex items-center space-x-2 bg-gray-50 px-3 py-1 rounded-full border border-gray-200">
									<div
										className={`w-2.5 h-2.5 ${getStatusColor()} rounded-full ${
											!isConnected ? "animate-pulse" : ""
										}`}
									/>
									<span className="text-sm font-medium text-gray-700">
										{isConnected ? "Live" : "Offline"}
									</span>
								</div>
							</div>
							<div className="text-sm text-gray-600 space-y-4">
								<div className="flex items-start space-x-3">
									{isConnected ? (
										<FaCheckCircle className="text-green-500 mt-1 flex-shrink-0 text-base" />
									) : (
										<FaCircle className="text-red-500 mt-1 flex-shrink-0 text-xs" />
									)}
									<div>
										<p className="text-gray-800 font-medium">
											{isConnected
												? "Connection established"
												: "Establishing connection..."}
										</p>
										<p className="text-gray-500 text-xs">
											{isConnected
												? "Connected to NeuraFlow AI backend server."
												: "Attempting to connect to the automation engine."}
										</p>
									</div>
								</div>
								<div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
									<div className="flex items-center justify-between mb-2">
										<span className="text-sm font-medium text-gray-700 flex items-center">
											<FaBolt className="text-yellow-500 mr-2" />
											Server Latency
										</span>
										<span className="text-sm font-semibold text-gray-800">
											{latency !== null ? `${latency} ms` : "Measuring..."}
										</span>
									</div>
									<div className="w-full bg-gray-200 rounded-full h-2">
										<div
											className={`h-full rounded-full ${getLatencyColor()}`}
											style={{ width: getLatencyWidth() }}></div>
									</div>
								</div>
							</div>
							<div className="mt-6 flex flex-col space-y-3">
								<button
									onClick={() => setIsSessionInfoModalOpen(true)}
									className="w-full px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors flex items-center justify-center text-sm font-medium shadow-sm">
									<FaChartLine className="mr-2" /> View Session Metrics
								</button>
								<button
									onClick={() => setIsActivityLogModalOpen(true)}
									className="w-full px-4 py-2 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition-colors flex items-center justify-center text-sm font-medium shadow-sm">
									<FaHistory className="mr-2" /> View Activity Log
								</button>
							</div>
						</div>

						<div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 flex-1 flex flex-col">
							<div className="flex items-center justify-between mb-4">
								<h3 className="text-lg font-semibold text-gray-900 flex items-center">
									<FaFlask className="text-purple-500 mr-2 text-xl" />
									Generated Playwright Test
								</h3>
								<button
									onClick={() => setIsTestCaseModalOpen(true)}
									className="text-blue-500 hover:text-blue-700 transition-colors text-sm font-medium">
									Open Test Code
								</button>
							</div>
							<div className="flex-1 min-h-[100px] bg-gray-900 text-white p-4 rounded-lg font-mono text-xs overflow-y-auto custom-scrollbar relative">
								<pre className="whitespace-pre-wrap">{testCase}</pre>
								<button
									onClick={copyTestCase}
									className="absolute top-2 right-2 p-2 bg-gray-700 rounded-md text-gray-300 hover:bg-gray-600 transition-colors">
									<FaCopy className="text-sm" />
								</button>
							</div>
						</div>
					</aside>
				</div>
			</main>

			<Modal
				isOpen={isSessionInfoModalOpen}
				onClose={() => setIsSessionInfoModalOpen(false)}
				title="Session Metrics"
				large={false}>
				<div className="space-y-4 text-gray-800">
					<p className="flex justify-between">
						<span className="font-medium">Session Start:</span>
						<span>
							{sessionStartTime.toLocaleString(undefined, {
								dateStyle: "medium",
								timeStyle: "medium",
							})}
						</span>
					</p>
					<p className="flex justify-between">
						<span className="font-medium">Current Duration:</span>
						<span>{formatDuration(sessionStartTime)}</span>
					</p>
					<p className="flex justify-between">
						<span className="font-medium">Actions Executed:</span>
						<span>{actionCount}</span>
					</p>
					<p className="flex justify-between">
						<span className="font-medium">Server Latency:</span>
						<span>{latency !== null ? `${latency} ms` : "N/A"}</span>
					</p>
					<p className="flex justify-between">
						<span className="font-medium">Status:</span>
						<span
							className={`px-3 py-1 rounded-full text-xs font-semibold ${
								isConnected
									? "bg-green-100 text-green-800"
									: "bg-red-100 text-red-800"
							}`}>
							{isConnected ? "Active" : "Inactive"}
						</span>
					</p>
				</div>
			</Modal>

			<Modal
				isOpen={isActivityLogModalOpen}
				onClose={() => setIsActivityLogModalOpen(false)}
				title="Activity Log"
				large={true}>
				<div className="space-y-4">
					{activityLog.length === 0 ? (
						<p className="text-gray-500 text-center">No activity yet.</p>
					) : (
						activityLog.map((log) => (
							<div key={log.id} className="flex items-start space-x-3">
								<div className="pt-1">{getActivityIcon(log.type)}</div>
								<div className="flex-1">
									<p className="text-sm font-medium text-gray-800">
										{log.message}
									</p>
									<p className="text-xs text-gray-500 mt-0.5">
										{log.details} - {formatTime(log.timestamp)}
									</p>
								</div>
							</div>
						))
					)}
				</div>
			</Modal>

			<Modal
				isOpen={isTestCaseModalOpen}
				onClose={() => setIsTestCaseModalOpen(false)}
				title="Generated Playwright Test Case"
				large={true}>
				<div className="bg-gray-900 text-white p-6 rounded-lg relative min-h-[300px]">
					<pre className="whitespace-pre-wrap text-sm">{testCase}</pre>
					<button
						onClick={copyTestCase}
						className="absolute top-3 right-3 p-2 bg-gray-700 rounded-md text-gray-300 hover:bg-gray-600 transition-colors flex items-center text-xs">
						<FaCopy className="mr-1" /> Copy Code
					</button>
				</div>
				<div className="mt-4 text-sm text-gray-600">
					<p>
						You can copy this code and run it with Playwright.
						<br />
						Save it as, e.g., `my_test.spec.js` and run `npx playwright test
						my_test.spec.js`.
					</p>
				</div>
			</Modal>

			<Modal
				isOpen={isCurrentPageModalOpen}
				onClose={() => setIsCurrentPageModalOpen(false)}
				title="Current Page Details"
				large={false}>
				{currentPage ? (
					<div className="space-y-4 text-gray-800">
						<div>
							<p className="text-xs text-gray-500">Title</p>
							<p className="text-gray-800 font-medium">
								{currentPage.title || "N/A"}
							</p>
						</div>
						<div>
							<p className="text-xs text-gray-500">URL</p>
							<p className="text-gray-800 font-medium break-all">
								{currentPage.url || "N/A"}
							</p>
						</div>
						<div className="grid grid-cols-2 gap-4">
							<div>
								<p className="text-xs text-gray-500">Buttons Found</p>
								<p className="text-gray-800 font-medium">
									{currentPage.buttons?.length || 0}
								</p>
							</div>
							<div>
								<p className="text-xs text-gray-500">Links Found</p>
								<p className="text-gray-800 font-medium">
									{currentPage.links?.length || 0}
								</p>
							</div>
							<div>
								<p className="text-xs text-gray-500">Inputs Found</p>
								<p className="text-gray-800 font-medium">
									{currentPage.inputs?.length || 0}
								</p>
							</div>
							<div>
								<p className="text-xs text-gray-500">Forms Found</p>
								<p className="text-gray-800 font-medium">
									{currentPage.forms?.length || 0}
								</p>
							</div>
						</div>
						{currentPage.links && currentPage.links.length > 0 && (
							<div>
								<p className="text-xs text-gray-500 mb-1">
									Sample Links (First 5)
								</p>
								<ul className="list-disc list-inside text-sm">
									{currentPage.links.slice(0, 5).map((link, index) => (
										<li key={index} className="text-gray-700 truncate">
											<a
												href={link.href}
												target="_blank"
												rel="noopener noreferrer"
												className="text-blue-600 hover:underline">
												{link.text || link.href}
											</a>
										</li>
									))}
								</ul>
							</div>
						)}
						{currentPage.buttons && currentPage.buttons.length > 0 && (
							<div>
								<p className="text-xs text-gray-500 mb-1">
									Sample Buttons (First 5)
								</p>
								<ul className="list-disc list-inside text-sm">
									{currentPage.buttons.slice(0, 5).map((button, index) => (
										<li key={index} className="text-gray-700 truncate">
											{button.text}
										</li>
									))}
								</ul>
							</div>
						)}
						<button
							onClick={() => window.open(currentPage.url, "_blank")}
							className="w-full px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center justify-center text-sm font-medium shadow-sm mt-4">
							Open Page in New Tab{" "}
							<FaExternalLinkAlt className="ml-2 text-xs" />
						</button>
					</div>
				) : (
					<p className="text-gray-500 text-center">
						No current page information available.
					</p>
				)}
			</Modal>

			<Modal
				isOpen={isPageElementsModalOpen}
				onClose={() => setIsPageElementsModalOpen(false)}
				title="Real-time DOM Tree Diagram"
				large={true}>
				{currentPage && mermaidDiagram ? (
					<div className="space-y-4 h-full flex flex-col">
						<div className="bg-gray-100 border border-gray-200 p-4 rounded-lg flex-1 flex justify-center items-center overflow-auto max-h-[calc(100vh*0.9-200px)]">
							<div
								ref={mermaidContainerRef}
								className="mermaid flex-shrink-0 w-full h-full"></div>
						</div>
						<button
							onClick={() => setIsMermaidFullscreenModalOpen(true)}
							className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center text-sm font-medium shadow-sm">
							<FaExpand className="mr-2" /> View Fullscreen Diagram
						</button>
						<p className="text-sm text-gray-600 text-center">
							This diagram visualizes the hierarchical structure of the current
							page's DOM elements. Note: The complexity of the diagram depends
							on the detail provided by the backend.
						</p>

						<hr className="my-6 border-gray-200" />
						<h3 className="text-xl font-semibold mb-4 flex items-center">
							<FaCode className="mr-2 text-indigo-500" /> Detailed Page
							Selectors
						</h3>

						{currentPage.buttons && currentPage.buttons.length > 0 && (
							<div>
								<h4 className="text-lg font-semibold mb-2 flex items-center">
									<FaMousePointer className="mr-2 text-blue-500" /> Buttons (
									{currentPage.buttons.length})
								</h4>
								<div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar bg-gray-50 p-3 rounded-lg border border-gray-200">
									{currentPage.buttons.map((button, index) => (
										<div
											key={`button-${index}`}
											className="p-2 border-b last:border-b-0 border-gray-100 text-sm">
											<p className="font-medium">{button.text || "No Text"}</p>
											{button.selector && (
												<p className="text-gray-600 font-mono text-xs break-all mt-1">
													Selector: `{button.selector}`
												</p>
											)}
										</div>
									))}
								</div>
							</div>
						)}

						{currentPage.links && currentPage.links.length > 0 && (
							<div>
								<h4 className="text-lg font-semibold mb-2 flex items-center">
									<FaExternalLinkAlt className="mr-2 text-green-500" /> Links (
									{currentPage.links.length})
								</h4>
								<div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar bg-gray-50 p-3 rounded-lg border border-gray-200">
									{currentPage.links.map((link, index) => (
										<div
											key={`link-${index}`}
											className="p-2 border-b last:border-b-0 border-gray-100 text-sm">
											<p className="font-medium">{link.text || "No Text"}</p>
											{link.href && (
												<p className="text-gray-600 font-mono text-xs break-all mt-1">
													Href: `{link.href}`
												</p>
											)}
											{link.selector && (
												<p className="text-gray-600 font-mono text-xs break-all mt-1">
													Selector: `{link.selector}`
												</p>
											)}
										</div>
									))}
								</div>
							</div>
						)}

						{currentPage.inputs && currentPage.inputs.length > 0 && (
							<div>
								<h4 className="text-lg font-semibold mb-2 flex items-center">
									<FaKeyboard className="mr-2 text-purple-500" /> Input Fields (
									{currentPage.inputs.length})
								</h4>
								<div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar bg-gray-50 p-3 rounded-lg border border-gray-200">
									{currentPage.inputs.map((input, index) => (
										<div
											key={`input-${index}`}
											className="p-2 border-b last:border-b-0 border-gray-100 text-sm">
											<p className="font-medium">
												Type: {input.type || "text"}
											</p>
											{input.name && (
												<p className="text-gray-600 text-xs">
													Name: {input.name}
												</p>
											)}
											{input.id && (
												<p className="text-gray-600 text-xs">ID: {input.id}</p>
											)}
											{input.placeholder && (
												<p className="text-gray-600 text-xs">
													Placeholder: {input.placeholder}
												</p>
											)}
											{input.selector && (
												<p className="text-gray-600 font-mono text-xs break-all mt-1">
													Selector: `{input.selector}`
												</p>
											)}
										</div>
									))}
								</div>
							</div>
						)}

						{currentPage.forms && currentPage.forms.length > 0 && (
							<div>
								<h4 className="text-lg font-semibold mb-2 flex items-center">
									<FaDatabase className="mr-2 text-orange-500" /> Forms (
									{currentPage.forms.length})
								</h4>
								<div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar bg-gray-50 p-3 rounded-lg border border-gray-200">
									{currentPage.forms.map((form, index) => (
										<div
											key={`form-${index}`}
											className="p-2 border-b last:border-b-0 border-gray-100 text-sm">
											<p className="font-medium">
												Action: {form.action || "N/A"}
											</p>
											<p className="text-gray-600 text-xs">
												Method: {form.method || "N/A"}
											</p>
											{form.selector && (
												<p className="text-gray-600 font-mono text-xs break-all mt-1">
													Selector: `{form.selector}`
												</p>
											)}
										</div>
									))}
								</div>
							</div>
						)}

						{(!currentPage.buttons || currentPage.buttons.length === 0) &&
							(!currentPage.links || currentPage.links.length === 0) &&
							(!currentPage.inputs || currentPage.inputs.length === 0) &&
							(!currentPage.forms || currentPage.forms.length === 0) && (
								<p className="text-gray-500 text-center">
									No structured elements found on the current page.
								</p>
							)}
					</div>
				) : (
					<p className="text-gray-500 text-center">
						No page information available to display DOM elements or diagram.
					</p>
				)}
			</Modal>

			<Modal
				isOpen={isMermaidFullscreenModalOpen}
				onClose={() => setIsMermaidFullscreenModalOpen(false)}
				title="Full-Screen DOM Tree Diagram"
				fullScreen={true}>
				{currentPage && mermaidDiagram ? (
					<div className="flex justify-center items-center h-full w-full overflow-auto">
						<div
							ref={mermaidFullscreenContainerRef}
							className="mermaid flex-shrink-0 w-full h-full"></div>
					</div>
				) : (
					<p className="text-gray-500 text-center">
						No diagram available for full-screen view.
					</p>
				)}
			</Modal>
		</div>
	);
};

export { AIWebAutomation };
