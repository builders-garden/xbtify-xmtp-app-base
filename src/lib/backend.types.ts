export type SuccessAskResponse = {
	status: "ok";
	data: {
		answer: string;
		agentData: unknown;
	};
};
export type ErrorAskResponse = {
	status: "nok";
	message: string;
	error?: string;
};

export type AskResponse = SuccessAskResponse | ErrorAskResponse;
