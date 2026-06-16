import { supabase } from "../supabase.js";

import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2 } from "../r2client.js";

import axios from "axios";

export const createClient = async (req, res) => {
  try {
    const {
      clientName,
      eventType,
      eventDate,
      selectedLocation,
      workflow_template_id,
      workflowSteps,
      teamAssignments,
    } = req.body;

    if (
      !clientName ||
      !eventType ||
      !eventDate ||
      !selectedLocation ||
      !workflowSteps?.length
    ) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    const OFFICE_ADDRESS = 'New york'
    const freeMiles = 20;
    let drivingDistance = 0;
    let travelFee = 0;

    try {
      const distanceResponse =
        await axios.get(
          "https://driving-distance-calculator-between-two-points.p.rapidapi.com/data",
          {
            params: {
              origin: OFFICE_ADDRESS,
              destination: selectedLocation,
            },
            headers: {
              "x-rapidapi-key":'d3cfd720b6msh644a12c2e9f2d08p186288jsn9c9392aa203b',
              "x-rapidapi-host":
                "driving-distance-calculator-between-two-points.p.rapidapi.com",
              "Content-Type":
                "application/json",
            },
          }
        );

      const distanceData =
        distanceResponse.data?.body
          ?.distance;

      if (distanceData) {
        drivingDistance = Number(
          distanceData.kilometers.toFixed(
            2
          )
        );

        travelFee = Number(
          (
            (drivingDistance - freeMiles) * 5
          ).toFixed(2)
        );
      }
    } catch (distanceError) {
      console.error(
        "Distance Calculation Error:",
        distanceError?.response
          ?.data || distanceError
      );
    }

    // create client
    const {
      data: clientData,
      error: clientError,
    } = await supabase
      .from("clients")
      .insert([
        {
          client_name: clientName,

          event_name: eventType,

          event_date: eventDate,

          event_location:
            selectedLocation,

          email: `${clientName
            .trim()
            .toLowerCase()
            .replace(
              /\s+/g,
              ""
            )}${Date.now()
            .toString()
            .slice(
              -4
            )}@midori.com`,

          password: "123456",

          driving_distance:
            drivingDistance,

          travel_fee:
            travelFee,

          workflow_template_id:
            workflow_template_id ||
            null,

          created_by:
            req.user.member_id,
        },
      ])
      .select()
      .single();

    if (clientError) {
      return res.status(500).json({
        success: false,
        message:
          clientError.message,
      });
    }

    let projectSteps = [];

    // TEMPLATE WORKFLOW
    if (workflow_template_id) {
      const {
        data: workflowStepsFromDB,
        error: workflowError,
      } = await supabase
        .from("workflow_steps")
        .select("*")
        .eq(
          "workflow_template_id",
          workflow_template_id
        )
        .order("step_order", {
          ascending: true,
        });

      if (workflowError) {
        return res.status(500).json({
          success: false,
          message:
            workflowError.message,
        });
      }

      projectSteps =
        workflowStepsFromDB.map(
          (step) => {
            const assignedStep =
              teamAssignments?.find(
                (
                  assignment
                ) =>
                  assignment.workflow_step_id ===
                  step.workflow_step_id
              );

            return {
              client_id:
                clientData.client_id,

              workflow_step_id:
                step.workflow_step_id,

              assigned_member_id:
                assignedStep?.assigned_member_id ||
                null,

              step_name:
                step.step_name,

              step_order:
                step.step_order,

              step_status:
                "pending",
            };
          }
        );
    }

    // CUSTOM WORKFLOW
    else {
      projectSteps =
        workflowSteps.map(
          (step, index) => {
            const assignedStep =
              teamAssignments?.find(
                (
                  assignment
                ) =>
                  assignment.workflow_step_id ===
                  step.workflow_step_id
              );

            return {
              client_id:
                clientData.client_id,

              workflow_step_id:
                null,

              assigned_member_id:
                assignedStep?.assigned_member_id ||
                null,

              step_name:
                step.step_name,

              step_order:
                step.step_order ||
                index + 1,

              step_status:
                "pending",
            };
          }
        );
    }

    const {
      error: projectStepsError,
    } = await supabase
      .from("project_steps")
      .insert(projectSteps);

    if (projectStepsError) {
      return res.status(500).json({
        success: false,
        message:
          projectStepsError.message,
      });
    }

    // create default moodboard
    const {
      error: moodboardError,
    } = await supabase
      .from("moodboards")
      .insert([
        {
          client_id:
            clientData.client_id,
        },
      ]);

    if (moodboardError) {
      return res.status(500).json({
        success: false,
        message:
          moodboardError.message,
      });
    }

    return res.status(201).json({
      success: true,
      message:
        "Client created successfully",
      data: clientData,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message:
        error.message,
    });
  }
};

export const getWorkflowTemplates = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("workflow_templates")
      .select("*")
      .eq("is_active", true)
      .order("workflow_template_id");

    if (error) {
      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


export const getWorkflowSteps = async (req, res) => {
  try {
    const { templateId } = req.params;

    const { data, error } = await supabase
      .from("workflow_steps")
      .select("*")
      .eq(
        "workflow_template_id",
        templateId
      )
      .order("step_order", {
        ascending: true,
      });

    if (error) {
      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};



export const getTeamMembers = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("members")
      .select(
        "member_id, full_name, role"
      )
      .in("role", ["team", "admin"]);

    if (error) {
      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getAllClients = async (req, res) => {
  try {
    let clients = [];



    // Admins see everything
    if (
      req.user.role === "admin" ||
      req.user.role === "superadmin"
    ) {
      const {
        data,
        error,
      } = await supabase
        .from("clients")
        .select("*")
        .order("created_at", {
          ascending: false,
        });

      if (error) throw error;

      clients = data;
    } else {
      // Team members only see assigned clients

      const {
        data: assignedSteps,
        error: assignedError,
      } = await supabase
        .from("project_steps")
        .select("client_id")
        .eq(
          "assigned_member_id",
          req.user.client_id
        );

      if (assignedError) throw assignedError;

      const clientIds = [
        ...new Set(
          assignedSteps.map(
            (step) => step.client_id
          )
        ),
      ];

      if (clientIds.length === 0) {
        return res.status(200).json({
          success: true,
          data: [],
        });
      }

      const {
        data,
        error,
      } = await supabase
        .from("clients")
        .select("*")
        .in("client_id", clientIds)
        .order("created_at", {
          ascending: false,
        });

      if (error) throw error;

      clients = data;
    }

    const dashboardData = await Promise.all(
      clients.map(async (client) => {
        const {
          data: projectSteps,
          error: stepsError,
        } = await supabase
          .from("project_steps")
          .select("*")
          .eq(
            "client_id",
            client.client_id
          );

        if (stepsError) {
          throw stepsError;
        }

        const totalSteps =
          projectSteps.length;

        const completedSteps =
          projectSteps.filter(
            (step) =>
              step.step_status ===
              "completed"
          ).length;

        const ongoingStep =
          projectSteps.find(
            (step) =>
              step.step_status ===
              "ongoing"
          );

        const progressPercentage =
          totalSteps === 0
            ? 0
            : Math.round(
                (completedSteps /
                  totalSteps) *
                  100
              );

        const assignedMemberIds = [
          ...new Set(
            projectSteps
              .filter(
                (step) =>
                  step.assigned_member_id
              )
              .map(
                (step) =>
                  step.assigned_member_id
              )
          ),
        ];

        let assignedMembers = [];

        if (assignedMemberIds.length) {
          const {
            data: members,
            error: membersError,
          } = await supabase
            .from("members")
            .select(
              "member_id, full_name"
            )
            .in(
              "member_id",
              assignedMemberIds
            );

          if (membersError) {
            throw membersError;
          }

          assignedMembers =
            members?.map(
              (member) =>
                member.full_name
                  ?.split(" ")
                  .map(
                    (part) => part[0]
                  )
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()
            ) || [];
        }

        return {
          client_id:
            client.client_id,

          client_name:
            client.client_name,

          event_type:
            client.event_name,

          event_date:
            client.event_date,

          current_step:
            ongoingStep?.step_name ||
            "Not Started Yet",

          progress_percentage:
            progressPercentage,

          assigned_members:
            assignedMembers,
        };
      })
    );

    return res.status(200).json({
      success: true,
      data: dashboardData,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


export const getClientAssets =
  async (req, res) => {
    try {
      const { clientId } =
        req.params;

      const page = Number(
        req.query.page || 1
      );

      const limit = 4;

      const fileCategory =
        req.query.fileCategory;

      const from =
        (page - 1) * limit;

      const to =
        from + limit - 1;

      let query = supabase
        .from("files")
        .select("*", {
          count: "exact",
        })
        .eq(
          "client_id",
          clientId
        );

      if (
        fileCategory &&
        fileCategory !== "all"
      ) {
        query = query.eq(
          "file_category",
          fileCategory
        );
      }

      const {
        data: files,
        error,
        count,
      } = await query
        .order(
          "created_at",
          {
            ascending: false,
          }
        )
        .range(from, to);

      if (error) {
        throw error;
      }

      const filesWithPreview =
        await Promise.all(
          files.map(
            async (file) => {
              const command =
                new GetObjectCommand({
                  Bucket:
                    process.env
                      .R2_BUCKET,
                  Key:
                    file.object_storage_key,
                });

              const previewUrl =
                await getSignedUrl(
                  r2,
                  command,
                  {
                    expiresIn:
                      3600,
                  }
                );

              return {
                ...file,

                preview_url:
                  previewUrl,
              };
            }
          )
        );

      return res.status(200).json({
        success: true,

        data:
          filesWithPreview,

        pagination: {
          page,

          limit,

          total:
            count || 0,

          total_pages:
            Math.ceil(
              (count || 0) /
                limit
            ),

          has_next:
            page * limit <
            (count || 0),
        },
      });
    } catch (error) {
      console.error(
        "Get Client Assets Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error?.message ||
          "Internal Server Error",
      });
    }
  };

  export const updateClient =
  async (req, res) => {
    try {
      const { clientId } =
        req.params;

      const {
        client_name,
        event_date,
        event_type,
        event_location,
      } = req.body;


      const {
        data: client,
        error,
      } = await supabase
        .from("clients")
        .update({
          client_name,

          event_date,

          event_name:
            event_type,

          event_location,
        })
        .eq(
          "client_id",
          clientId
        )
        .select()
        .single();

      if (error) {
        throw error;
      }

      return res.status(200).json({
        success: true,
        message:
          "Client updated successfully",
        data: client,
      });
    } catch (error) {
      console.error(
        "Update Client Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error?.message ||
          "Internal Server Error",
      });
    }
  };