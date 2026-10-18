import {afterEach,describe,expect,it,vi} from "vitest";
import {fetchWithRetry} from "./api.js";

const ok=body=>({ok:true,status:200,json:async()=>body});
const status=code=>({ok:false,status:code,json:async()=>({})});
afterEach(()=>vi.unstubAllGlobals());

describe("fetchWithRetry",()=>{
  it("retries a dropped connection and a restarting backend, then succeeds",async()=>{
    const fetchMock=vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce(status(502)).mockResolvedValueOnce(ok({fine:true}));
    vi.stubGlobal("fetch",fetchMock);
    const response=await fetchWithRetry("/recipes",undefined,{delay:1});
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it("gives up after the retries and reports the failure",async()=>{
    const fetchMock=vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch",fetchMock);
    await expect(fetchWithRetry("/recipes",undefined,{retries:2,delay:1})).rejects.toThrow("Failed to fetch");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it("does not retry a real error answer or an aborted request",async()=>{
    const fetchMock=vi.fn().mockResolvedValue(status(404));
    vi.stubGlobal("fetch",fetchMock);
    expect((await fetchWithRetry("/x",undefined,{delay:1})).status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const aborted=vi.fn().mockRejectedValue(Object.assign(new Error("aborted"),{name:"AbortError"}));
    vi.stubGlobal("fetch",aborted);
    await expect(fetchWithRetry("/x",{signal:{aborted:true}},{delay:1})).rejects.toThrow("aborted");
    expect(aborted).toHaveBeenCalledTimes(1);
  });
});
